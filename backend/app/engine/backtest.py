"""Deterministic backtest engine.

Pure functions only: same macro + same OHLCV data always yields the same
result. No randomness, no I/O, no wall-clock dependence.

Execution assumptions (also documented in README):
  * Daily (1d) bars, sequential simulation.
  * Signals are evaluated on the bar's CLOSE and fills happen at that close
    (adjusted for slippage). Intrabar high/low is not used to trigger TP/SL.
  * Commission is charged per side; slippage worsens each fill; funding
    (shorts only, default 0) accrues per held day on notional.
  * Leverage is fixed at 1x, so there is no liquidation.
  * Short PnL is sign-reversed: price down = profit, price up = loss.
"""
from __future__ import annotations

from typing import List, Optional

import pandas as pd
from pydantic import BaseModel

from .candles import make_candle_sim
from .schema import CANDLE_TYPES, Macro, RuleType
from .stepper import DcaSim, PositionSim


class EquityPoint(BaseModel):
    t: str  # ISO timestamp
    equity: float


class BacktestResult(BaseModel):
    final_return_pct: float
    win_rate_pct: float
    mdd_pct: float
    total_trades: int
    initial_capital: float
    final_equity: float
    equity_curve: List[EquityPoint]
    # bars where a take-profit and stop-loss both triggered in one candle
    # (stop taken, conservative). 0 for the legacy A/B/C engines.
    same_bar_sl_bars: int = 0


# Fill-price / execution logic lives in stepper.py (shared with paper trading).


def _metrics(
    equity_curve: List[EquityPoint],
    closed_trades: List[float],
    total_trades: int,
    initial_capital: float,
    *,
    win_rate_override: Optional[float] = None,
    same_bar_sl_bars: int = 0,
) -> BacktestResult:
    final_equity = equity_curve[-1].equity if equity_curve else initial_capital
    final_return_pct = (final_equity - initial_capital) / initial_capital * 100.0

    # Max drawdown on the equity curve (reported as a positive magnitude).
    peak = float("-inf")
    max_dd = 0.0
    for pt in equity_curve:
        if pt.equity > peak:
            peak = pt.equity
        if peak > 0:
            dd = (pt.equity - peak) / peak
            if dd < max_dd:
                max_dd = dd
    mdd_pct = -max_dd * 100.0

    if win_rate_override is not None:
        win_rate_pct = win_rate_override
    elif closed_trades:
        wins = sum(1 for p in closed_trades if p > 0)
        win_rate_pct = 100.0 * wins / len(closed_trades)
    else:
        win_rate_pct = 0.0

    return BacktestResult(
        final_return_pct=round(final_return_pct, 4),
        win_rate_pct=round(win_rate_pct, 4),
        mdd_pct=round(mdd_pct, 4),
        total_trades=total_trades,
        initial_capital=round(initial_capital, 2),
        final_equity=round(final_equity, 2),
        equity_curve=equity_curve,
        same_bar_sl_bars=same_bar_sl_bars,
    )


def _iso(ts) -> str:
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")


# --- Rule A / B: single-position long or short --------------------------
def _run_single_position(macro: Macro, df: pd.DataFrame) -> BacktestResult:
    """Drive the shared PositionSim over candle closes (same machine paper uses)."""
    closes = df["close"].to_numpy(dtype=float)
    times = df["timestamp"].tolist()

    sim = PositionSim(macro)
    equity_curve: List[EquityPoint] = []
    for i in range(len(closes)):
        c = closes[i]
        sim.step(c)
        equity_curve.append(EquityPoint(t=_iso(times[i]), equity=round(sim.equity(c), 4)))

    return _metrics(equity_curve, sim.closed_trades, len(sim.closed_trades), sim.initial_capital)


# --- Rule C: periodic DCA (long only) -----------------------------------
def _run_dca(macro: Macro, df: pd.DataFrame) -> BacktestResult:
    closes = df["close"].to_numpy(dtype=float)
    times = df["timestamp"].tolist()
    n = len(closes)

    amount_per_buy = float(macro.params["amount_per_buy"])
    interval = max(1, int(macro.params["interval_days"]))

    # Plan the buys up front so the return base matches the original engine,
    # then drive the shared DcaSim (same machine paper uses).
    num_buys = (n - 1) // interval + 1 if n > 0 else 0
    initial_capital = max(num_buys * amount_per_buy, 1e-9)

    sim = DcaSim(macro, initial_capital=initial_capital, max_buys=num_buys)
    equity_curve: List[EquityPoint] = []
    for i in range(n):
        c = closes[i]
        sim.step(c)
        equity_curve.append(EquityPoint(t=_iso(times[i]), equity=round(sim.equity(c), 4)))

    final_return = (
        (equity_curve[-1].equity - initial_capital) / initial_capital * 100.0
        if equity_curve
        else 0.0
    )
    # DCA is buy-and-hold: no round trips, so win rate reflects the final outcome.
    win_rate = 100.0 if final_return > 0 else 0.0
    return _metrics(
        equity_curve,
        closed_trades=[],
        total_trades=num_buys,
        initial_capital=initial_capital,
        win_rate_override=win_rate,
    )


# --- Rule D~J: shared candle engine (multi-order + indicator strategies) -
def _run_candle_engine(macro: Macro, df: pd.DataFrame) -> BacktestResult:
    """Drive the incremental candle sim over OHLC bars (same machine paper uses).

    Look-ahead safety, same-bar stop-loss priority and multi-order accounting
    all live in ``engine.candles``; this just feeds it closed bars.
    """
    opens = df["open"].to_numpy(dtype=float)
    highs = df["high"].to_numpy(dtype=float)
    lows = df["low"].to_numpy(dtype=float)
    closes = df["close"].to_numpy(dtype=float)
    times = df["timestamp"].tolist()

    sim = make_candle_sim(macro)
    equity_curve: List[EquityPoint] = []
    for i in range(len(closes)):
        ts = pd.Timestamp(times[i]).to_pydatetime()
        sim.on_candle(opens[i], highs[i], lows[i], closes[i], ts)
        equity_curve.append(EquityPoint(t=_iso(times[i]), equity=round(sim.equity(closes[i]), 4)))

    return _metrics(
        equity_curve,
        sim.closed_trades,
        len(sim.closed_trades),
        sim.initial_capital,
        same_bar_sl_bars=sim.same_bar_sl,
    )


def run_backtest(macro: Macro, df: pd.DataFrame) -> BacktestResult:
    """Run a deterministic backtest of ``macro`` over OHLCV ``df``.

    ``df`` columns: timestamp, open, high, low, close, volume (chronological).
    """
    if df is None or len(df) == 0:
        raise ValueError("no price data provided")
    df = df.sort_values("timestamp").reset_index(drop=True)

    if macro.rule_type in CANDLE_TYPES:
        return _run_candle_engine(macro, df)
    if macro.rule_type is RuleType.C:
        return _run_dca(macro, df)
    return _run_single_position(macro, df)
