"""Market selection (spot vs USDT-M futures) + funding-rate helpers."""
from __future__ import annotations

import pytest

from app.data import binance
from app.engine.schema import Macro, Risk


def _macro(side="long", leverage=1, market="auto"):
    return Macro(
        symbol="BTCUSDT",
        rule_type="A",
        position_side=side,
        leverage=leverage,
        market=market,
        params={"take_profit_pct": 5.0, "initial_capital": 1000.0},
        risk=Risk(invest_ratio=1.0, stop_loss_pct=3.0),
    )


# --- resolved_market (mirrors the real bot's auto rule) -----------------
def test_auto_long_1x_is_spot():
    assert _macro("long", 1).resolved_market() == "spot"


def test_auto_short_is_futures():
    assert _macro("short", 1).resolved_market() == "futures"


def test_auto_leverage_is_futures():
    assert _macro("long", 3).resolved_market() == "futures"


def test_explicit_market_is_honored():
    assert _macro("short", 5, market="spot").resolved_market() == "spot"
    assert _macro("long", 1, market="futures").resolved_market() == "futures"


# --- average daily funding (magnitude, 3 settlements/day) ---------------
def test_average_daily_funding_pct(monkeypatch):
    # 3 rates whose mean abs is 0.0002 -> ×3/day ×100 = 0.06% per day.
    monkeypatch.setattr(
        binance, "get_funding_history",
        lambda *a, **k: [(1, 0.0001), (2, -0.0002), (3, 0.0003)],
    )
    assert binance.average_daily_funding_pct("BTCUSDT", 0, 1) == pytest.approx(0.06)


def test_average_daily_funding_none_when_empty(monkeypatch):
    monkeypatch.setattr(binance, "get_funding_history", lambda *a, **k: [])
    assert binance.average_daily_funding_pct("BTCUSDT", 0, 1) is None
