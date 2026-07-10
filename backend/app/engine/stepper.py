"""Stateful, price-by-price execution machines shared by backtest and paper.

The backtest engine feeds these one *candle close* at a time; paper trading
feeds them one *live tick* at a time. Same fill/commission/slippage/condition
logic — only the data source differs. This is the single source of truth for
"가상 체결" so the two paths can never drift apart.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from .leverage import liquidation_price
from .schema import Macro, PositionSide, RuleType


# --- fill-price helpers (slippage in percent) ---------------------------
def buy_fill(close: float, slippage_pct: float) -> float:
    """Buying pays up: fill is worse (higher) than close."""
    return close * (1.0 + slippage_pct / 100.0)


def sell_fill(close: float, slippage_pct: float) -> float:
    """Selling gets less: fill is worse (lower) than close."""
    return close * (1.0 - slippage_pct / 100.0)


@dataclass
class Fill:
    """One simulated execution produced by a sim step."""

    side: str  # "buy" | "sell" | "short" | "cover"
    price: float
    qty: float
    equity_after: float
    return_pct: float


class PositionSim:
    """Single-position machine for rule A (TP/SL re-entry) and B (band)."""

    def __init__(self, macro: Macro, initial_capital: Optional[float] = None) -> None:
        self.side = macro.position_side
        self.rule_type = macro.rule_type
        self.comm = macro.fees.commission_pct
        self.slip = macro.fees.slippage_pct
        self.funding = macro.fees.funding_pct
        self.invest_ratio = macro.risk.invest_ratio
        self.sl = macro.risk.stop_loss_pct  # may be None
        self.leverage = int(macro.leverage or 1)  # 1 == spot, no liquidation

        p = macro.params
        if self.rule_type is RuleType.A:
            self.tp = float(p["take_profit_pct"])
            self.buy_price = self.sell_price = None
        else:  # B
            self.tp = None
            self.buy_price = float(p["buy_price"])
            self.sell_price = float(p["sell_price"])

        self.initial_capital = float(
            initial_capital if initial_capital is not None else macro.initial_capital
        )
        self.cash = self.initial_capital
        self.in_pos = False
        self.qty = 0.0
        self.entry_fill = 0.0
        self.entry_commission = 0.0
        self.margin = 0.0  # equity committed to the open position (leverage bookkeeping)
        self.liq_price: Optional[float] = None  # isolated liquidation price (leverage > 1)
        self.closed_trades: List[float] = []
        # Liquidation stats surfaced to the result / paper status.
        self.liquidations = 0
        self.liquidated_loss = 0.0

    # -- exit / entry conditions (identical to the backtest semantics) --
    def _should_exit(self, c: float) -> bool:
        if self.side is PositionSide.LONG:
            if self.rule_type is RuleType.A:
                if c >= self.entry_fill * (1 + self.tp / 100.0):
                    return True
                if self.sl and c <= self.entry_fill * (1 - self.sl / 100.0):
                    return True
            else:  # B long
                if c >= self.sell_price:
                    return True
                if self.sl and c <= self.entry_fill * (1 - self.sl / 100.0):
                    return True
        else:  # SHORT
            if self.rule_type is RuleType.A:
                if c <= self.entry_fill * (1 - self.tp / 100.0):  # price fell -> profit
                    return True
                if self.sl and c >= self.entry_fill * (1 + self.sl / 100.0):  # rose -> loss
                    return True
            else:  # B short
                if c <= self.buy_price:
                    return True
                if self.sl and c >= self.entry_fill * (1 + self.sl / 100.0):
                    return True
        return False

    def _should_enter(self, c: float) -> bool:
        if self.rule_type is RuleType.A:
            return True  # always re-enter when flat
        if self.side is PositionSide.LONG:  # B long
            return c <= self.buy_price
        return c >= self.sell_price  # B short

    def _liquidated(self, c: float) -> bool:
        """True if this close breaches the isolated liquidation price."""
        if self.liq_price is None:
            return False
        if self.side is PositionSide.LONG:
            return c <= self.liq_price
        return c >= self.liq_price

    def _do_close(self, exec_price: float, mark: float) -> Fill:
        """Close the position at ``exec_price``.

        Returns the margin plus realized PnL to cash. With leverage the entry only
        locked ``margin`` (not the full notional), so the margin is added back here;
        at leverage 1 ``margin == notional`` and this reduces to the old spot math.
        """
        traded_qty = self.qty
        if self.side is PositionSide.LONG:
            f = sell_fill(exec_price, self.slip)
            exit_comm = self.qty * f * self.comm / 100.0
            self.cash += self.margin + self.qty * (f - self.entry_fill) - exit_comm
            pnl = self.qty * (f - self.entry_fill) - self.entry_commission - exit_comm
            side = "sell"
        else:
            f = buy_fill(exec_price, self.slip)  # cover
            exit_comm = self.qty * f * self.comm / 100.0
            self.cash += self.qty * (self.entry_fill - f) - exit_comm
            pnl = self.qty * (self.entry_fill - f) - self.entry_commission - exit_comm
            side = "cover"
        self.closed_trades.append(pnl)
        self.in_pos = False
        self.qty = 0.0
        self.margin = 0.0
        self.liq_price = None
        return self._fill(side, f, traded_qty, mark)

    def _liquidate(self, mark: float) -> Fill:
        """Force-close a leveraged position: the whole committed margin is lost
        (isolated). The loss is capped at the margin — cash cannot go past it."""
        traded_qty = self.qty
        px = self.liq_price if self.liq_price is not None else self.entry_fill
        # Long removed the margin from cash at entry (so cash already floors the
        # loss); short kept it, so wipe it now. Either way equity == remaining cash.
        if self.side is PositionSide.SHORT:
            self.cash -= self.margin
        side = "sell" if self.side is PositionSide.LONG else "cover"
        self.closed_trades.append(-self.margin)
        self.liquidations += 1
        self.liquidated_loss += self.margin
        self.in_pos = False
        self.qty = 0.0
        self.margin = 0.0
        self.liq_price = None
        return self._fill(side, px, traded_qty, mark)

    def step(self, price: float) -> Optional[Fill]:
        c = price
        # Funding accrues while holding a short.
        if self.in_pos and self.side is PositionSide.SHORT and self.funding > 0:
            self.cash -= self.qty * c * self.funding / 100.0

        fill: Optional[Fill] = None
        if self.in_pos:
            # Liquidation is checked first (conservative): a leveraged position that
            # breaches its liq price is force-closed, wiping the committed margin.
            if self._liquidated(c):
                fill = self._liquidate(c)
            elif self._should_exit(c):
                fill = self._do_close(c, c)
        else:
            if self._should_enter(c):
                margin = self.invest_ratio * self.cash  # cash == equity when flat
                notional = margin * self.leverage
                if self.side is PositionSide.LONG:
                    f = buy_fill(c, self.slip)
                    self.qty = notional / f
                    self.entry_commission = notional * self.comm / 100.0
                    self.cash -= margin + self.entry_commission
                    side = "buy"
                else:
                    f = sell_fill(c, self.slip)
                    self.qty = notional / f
                    self.entry_commission = notional * self.comm / 100.0
                    self.cash -= self.entry_commission
                    side = "short"
                self.entry_fill = f
                self.margin = margin
                self.liq_price = liquidation_price(
                    f, self.leverage, self.side, commission_pct=self.comm
                )
                self.in_pos = True
                fill = self._fill(side, f, self.qty, c)
        return fill

    def equity(self, price: float) -> float:
        if not self.in_pos:
            return self.cash
        if self.side is PositionSide.LONG:
            # free cash + locked margin + unrealized PnL (== cash + qty*price at 1x)
            return self.cash + self.margin + self.qty * (price - self.entry_fill)
        return self.cash + self.qty * (self.entry_fill - price)

    def _fill(self, side: str, price: float, qty: float, mark: float) -> Fill:
        eq = self.equity(mark)
        ret = (eq - self.initial_capital) / self.initial_capital * 100.0
        return Fill(side=side, price=price, qty=qty, equity_after=eq, return_pct=ret)


class DcaSim:
    """Periodic DCA machine (rule C, long only). Buys every ``interval`` steps.

    Backtest passes ``max_buys`` (bars/interval) and the planned capital so the
    result matches the original engine; paper trading passes a virtual balance
    and buys until it runs out (``max_buys=None``).
    """

    def __init__(
        self,
        macro: Macro,
        initial_capital: float,
        max_buys: Optional[int] = None,
    ) -> None:
        self.comm = macro.fees.commission_pct
        self.slip = macro.fees.slippage_pct
        self.sl = macro.risk.stop_loss_pct
        p = macro.params
        self.amount_per_buy = float(p["amount_per_buy"])
        self.interval = max(1, int(p["interval_days"]))
        self.max_buys = max_buys

        self.initial_capital = float(initial_capital)
        self.cash = self.initial_capital
        self.qty = 0.0
        self.cost_basis = 0.0
        self.stopped = False
        self.buys_done = 0
        self._step = 0
        # DCA (rule C) never uses leverage; expose the fields for a uniform interface.
        self.liquidations = 0
        self.liquidated_loss = 0.0

    def step(self, price: float) -> Optional[Fill]:
        c = price
        fill: Optional[Fill] = None

        # Optional stop loss on the accumulated position.
        if self.sl and self.qty > 0 and not self.stopped:
            if self.qty * c <= self.cost_basis * (1 - self.sl / 100.0):
                f = sell_fill(c, self.slip)
                proceeds = self.qty * f
                traded = self.qty
                self.cash += proceeds - proceeds * self.comm / 100.0
                self.qty = 0.0
                self.cost_basis = 0.0
                self.stopped = True
                fill = self._fill("sell", f, traded, c)

        # Scheduled buy.
        can_buy = (
            not self.stopped
            and self._step % self.interval == 0
            and (self.max_buys is None or self.buys_done < self.max_buys)
            and self.cash >= self.amount_per_buy
        )
        if can_buy and fill is None:
            fee = self.amount_per_buy * self.comm / 100.0
            invest = self.amount_per_buy - fee
            f = buy_fill(c, self.slip)
            self.qty += invest / f
            self.cash -= self.amount_per_buy
            self.cost_basis += self.amount_per_buy
            self.buys_done += 1
            fill = self._fill("buy", f, invest / f, c)

        self._step += 1
        return fill

    def equity(self, price: float) -> float:
        return self.cash + self.qty * price

    def _fill(self, side: str, price: float, qty: float, mark: float) -> Fill:
        eq = self.equity(mark)
        ret = (eq - self.initial_capital) / self.initial_capital * 100.0
        return Fill(side=side, price=price, qty=qty, equity_after=eq, return_pct=ret)


def make_sim(macro: Macro, initial_capital: Optional[float] = None):
    """Build the right sim for a macro (paper trading entry point)."""
    from .schema import CANDLE_TYPES

    if macro.rule_type in CANDLE_TYPES:
        # Types D~J are candle-based; aggregate ticks into candles for paper.
        from .candles import CandleAggregatorSim

        return CandleAggregatorSim(macro, initial_capital=initial_capital)
    if macro.rule_type is RuleType.C:
        base = initial_capital if initial_capital is not None else 1_000_000.0
        return DcaSim(macro, initial_capital=base, max_buys=None)
    return PositionSim(macro, initial_capital=initial_capital)
