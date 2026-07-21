"""Time-based common-risk controls for the non-candle sims (rules A/B/C).

`daily_max_loss`, `max_holding_hours` and `cooldown_minutes` used to be honored
only by the candle engine (D~J); these tests pin the same semantics onto the
PositionSim (A/B) and DcaSim (C) that the backtest and paper trading share.
"""
from __future__ import annotations

import pandas as pd
import pytest

from app.engine import Macro, run_backtest
from app.engine.schema import Fees, Period, Risk
from app.engine.stepper import make_sim
from tests.test_engine import NO_COST


def _df(closes, freq="D"):
    ts = pd.date_range("2024-01-01", periods=len(closes), freq=freq)
    return pd.DataFrame(
        {
            "timestamp": ts,
            "open": closes,
            "high": closes,
            "low": closes,
            "close": closes,
            "volume": [0.0] * len(closes),
        }
    )


def _macro(rule_type, side, params, risk):
    return Macro(
        symbol="BTCUSDT",
        rule_type=rule_type,
        position_side=side,
        params=params,
        risk=risk,
        period=Period(preset="custom"),
        fees=NO_COST,
    )


# --- max holding time (A long) -----------------------------------------
def test_a_long_max_holding_force_close():
    # TP=10% is never reached, but the 12h cap force-closes on the next daily bar.
    params = {"take_profit_pct": 10.0, "initial_capital": 1000.0}
    risk = Risk(invest_ratio=1.0, max_holding_hours=12)
    res = run_backtest(_macro("A", "long", params, risk), _df([100, 101]))
    assert res.total_trades == 1  # forced exit happened
    assert res.final_return_pct == pytest.approx(1.0, abs=1e-6)

    # Without the cap the position stays open (no round trip recorded).
    res_no = run_backtest(_macro("A", "long", params, Risk(invest_ratio=1.0)), _df([100, 101]))
    assert res_no.total_trades == 0


# --- re-entry cooldown after a stop (A long) ---------------------------
def test_a_long_cooldown_blocks_reentry():
    # Stop at bar1, then a >2-day cooldown blocks the otherwise-profitable re-entry.
    params = {"take_profit_pct": 10.0, "initial_capital": 1000.0}
    closes = [100, 94, 96, 130]  # enter, stop(-6%), would re-enter@96, TP@130
    risk = Risk(invest_ratio=1.0, stop_loss_pct=5.0, cooldown_minutes=3000)
    res = run_backtest(_macro("A", "long", params, risk), _df(closes))
    assert res.total_trades == 1  # only the stop; re-entry was blocked

    no_cd = Risk(invest_ratio=1.0, stop_loss_pct=5.0)
    res_no = run_backtest(_macro("A", "long", params, no_cd), _df(closes))
    assert res_no.total_trades == 2  # stop + a second round trip


# --- daily max loss halt (A long, intraday bars) -----------------------
def test_a_long_daily_max_loss_halts_and_closes():
    # Same-day hourly bars so drawdown is measured within one trading day.
    params = {"take_profit_pct": 100.0, "initial_capital": 1000.0}  # TP unreachable
    closes = [100, 100, 90, 110]  # -10% at bar2 trips the 5% daily cap
    risk = Risk(invest_ratio=1.0, daily_max_loss_pct=5.0)
    res = run_backtest(_macro("A", "long", params, risk), _df(closes, freq="h"))
    assert res.total_trades == 1  # force-closed at the breach
    assert res.final_return_pct == pytest.approx(-10.0, abs=1e-6)  # halted, no recovery

    # No cap: rides the recovery back to +10%, never closes.
    res_no = run_backtest(_macro("A", "long", params, Risk(invest_ratio=1.0)), _df(closes, freq="h"))
    assert res_no.total_trades == 0
    assert res_no.final_return_pct == pytest.approx(10.0, abs=1e-6)


# --- DCA daily max loss stops further buys (rule C) --------------------
def test_dca_daily_max_loss_stops_buys():
    params = {"amount_per_buy": 100.0, "interval_days": 1}
    risk = Risk(invest_ratio=1.0, daily_max_loss_pct=5.0)
    macro = _macro("C", "long", params, risk)
    ts = pd.date_range("2024-01-01", periods=5, freq="h")
    prices = [100, 100, 80, 80, 80]  # -13% by the 3rd hour

    sim = make_sim(macro)  # DcaSim, initial 1e6 by default -> use a small budget
    sim.cash = sim.initial_capital = sim._day_start_equity = 300.0
    for p, t in zip(prices, ts):
        sim.step(float(p), t.to_pydatetime())
    assert sim.buys_done == 2  # 3rd buy blocked by the daily halt

    # Baseline: without the cap all three scheduled buys go through.
    sim2 = make_sim(_macro("C", "long", params, Risk(invest_ratio=1.0)))
    sim2.cash = sim2.initial_capital = sim2._day_start_equity = 300.0
    for p, t in zip(prices, ts):
        sim2.step(float(p), t.to_pydatetime())
    assert sim2.buys_done == 3


# --- the shared-execution contract still holds when no time rules are set
def test_no_time_rules_is_unchanged_by_timestamps():
    # A macro with none of the advanced fields must backtest identically whether
    # or not timestamps are threaded (they are, now) — i.e. no silent drift.
    params = {"take_profit_pct": 3.0, "initial_capital": 1000.0}
    risk = Risk(invest_ratio=0.7, stop_loss_pct=4.0)
    res = run_backtest(_macro("A", "long", params, risk), _df([100, 103, 98, 106, 101, 110]))
    # Drive the same sim tick-by-tick with NO timestamps (legacy paper contract).
    sim = make_sim(_macro("A", "long", params, risk))
    curve = []
    for c in [100, 103, 98, 106, 101, 110]:
        sim.step(float(c))
        curve.append(round(sim.equity(c), 4))
    assert [round(p.equity, 4) for p in res.equity_curve] == curve
