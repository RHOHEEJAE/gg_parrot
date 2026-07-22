"""Parameter sweep (자동 최적화) — grid shape, best pick, and guards."""
from __future__ import annotations

import pandas as pd
import pytest

from app.engine.schema import Fees, Macro, Period, Risk
from app.optimize import DEFAULT_SL, DEFAULT_TP, MAX_AXIS, _clean_axis, optimize_tp_sl

NO_COST = Fees(commission_pct=0.0, slippage_pct=0.0, funding_pct=0.0)


def _macro(rule_type="A", params=None):
    return Macro(
        symbol="BTCUSDT",
        rule_type=rule_type,
        position_side="long",
        params=params or {"take_profit_pct": 5.0, "initial_capital": 1000.0},
        risk=Risk(invest_ratio=1.0, stop_loss_pct=3.0),
        period=Period(preset="1y"),  # optimize resolves the period (unlike run_backtest)
        fees=NO_COST,
    )


def _df(closes):
    ts = pd.date_range("2024-01-01", periods=len(closes), freq="D")
    return pd.DataFrame(
        {"timestamp": ts, "open": closes, "high": closes, "low": closes,
         "close": closes, "volume": [0.0] * len(closes)}
    )


# --- axis sanitizer -----------------------------------------------------
def test_clean_axis_dedupes_sorts_and_caps():
    assert _clean_axis([5, 3, 3, 8], DEFAULT_TP) == [3.0, 5.0, 8.0]
    assert _clean_axis(None, DEFAULT_TP) == DEFAULT_TP
    assert _clean_axis([-1, 0], DEFAULT_TP) == DEFAULT_TP  # all invalid -> fallback
    big = list(range(1, 30))
    assert len(_clean_axis(big, DEFAULT_TP)) == MAX_AXIS


# --- sweep over a stubbed data source -----------------------------------
def test_optimize_grid_shape_and_best(monkeypatch):
    closes = [100, 105, 103, 110, 108, 120, 118, 130, 128, 140]
    monkeypatch.setattr("app.optimize.get_klines", lambda *a, **k: (_df(closes), "cache"))

    res = optimize_tp_sl(_macro(), tp_values=[3, 5, 8], sl_values=[2, 4])
    assert res["tp_values"] == [3.0, 5.0, 8.0]
    assert res["sl_values"] == [2.0, 4.0]
    assert len(res["cells"]) == 6  # 3 tp × 2 sl
    # best is the max-return cell in the grid
    assert res["best"]["final_return_pct"] == max(c["final_return_pct"] for c in res["cells"])
    assert res["current"] == {"tp": 5.0, "sl": 3.0}
    assert "overfit" in res["disclaimer"].lower()


def test_optimize_rejects_unsupported_rule():
    # Rule C (DCA) has no take_profit_pct to sweep.
    m = _macro("C", params={"amount_per_buy": 100.0, "interval_days": 7})
    with pytest.raises(ValueError):
        optimize_tp_sl(m)
