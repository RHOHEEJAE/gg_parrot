"""Common risk controls inside the downloadable bot.

The bot ships as a source string, so nothing here is imported by the app at
runtime — these tests exec that string in a sandbox and drive the RiskGuard
directly. Without this, a syntax error or logic slip in the bundle would only
surface on a user's machine, mid-trade.
"""
from __future__ import annotations

import ast

import pytest

from app.realtrade import _BOT_PY


@pytest.fixture(scope="module")
def bot():
    """Exec the bundled bot source and hand back its namespace.

    ``__file__`` is needed because the bot resolves macro.json next to itself;
    ``__name__`` must be anything but ``__main__`` so the entrypoint guard at the
    bottom doesn't start a live trading loop during the test run.
    """
    ns: dict = {"__file__": "bot.py", "__name__": "ggparrot_bot"}
    exec(compile(_BOT_PY, "bot.py", "exec"), ns)
    return ns


def test_bundle_source_is_valid_python():
    ast.parse(_BOT_PY)  # a broken bundle is invisible until a user runs it


def _guard(bot, **risk):
    return bot["RiskGuard"](risk, 1000.0)


# --- daily max loss -----------------------------------------------------
def test_daily_max_loss_halts_new_entries(bot):
    g = _guard(bot, daily_max_loss_pct=5.0)
    g.roll_day()
    assert g.entry_blocked()[0] is False
    g.on_exit(-60.0, was_stop=False)  # -6% of 1000 -> past the 5% cap
    blocked, why = g.entry_blocked()
    assert blocked and "일일 최대손실" in why


def test_daily_max_loss_force_closes_on_unrealized(bot):
    g = _guard(bot, daily_max_loss_pct=5.0)
    g.roll_day()
    g.on_entry()
    assert g.force_close(-20.0)[0] is False  # -2%, still fine
    forced, why = g.force_close(-80.0)  # -8% unrealized
    assert forced and "일일 최대손실" in why


def test_small_loss_does_not_halt(bot):
    g = _guard(bot, daily_max_loss_pct=5.0)
    g.roll_day()
    g.on_exit(-10.0, was_stop=False)  # -1%
    assert g.entry_blocked()[0] is False


def test_new_day_clears_the_halt(bot):
    g = _guard(bot, daily_max_loss_pct=5.0)
    g.roll_day()
    g.on_exit(-60.0, was_stop=False)
    assert g.entry_blocked()[0] is True
    g._day = "1999-01-01"  # pretend the halt was yesterday
    g._halted_day = "1999-01-01"
    g.roll_day()
    assert g.entry_blocked()[0] is False
    assert g._day_pnl == 0.0  # daily tally resets too


# --- max holding time ---------------------------------------------------
def test_max_holding_forces_close(bot):
    g = _guard(bot, max_holding_hours=2)
    g.roll_day()
    g.on_entry()
    assert g.force_close(0.0)[0] is False
    g._entry_time -= 2 * 3600 + 1  # entered just over 2h ago
    forced, why = g.force_close(0.0)
    assert forced and "최대 보유시간" in why


def test_no_holding_cap_never_forces(bot):
    g = _guard(bot)
    g.roll_day()
    g.on_entry()
    g._entry_time -= 999 * 3600
    assert g.force_close(0.0)[0] is False


# --- re-entry cooldown --------------------------------------------------
def test_cooldown_blocks_only_after_a_stop(bot):
    g = _guard(bot, cooldown_minutes=30)
    g.roll_day()
    g.on_exit(5.0, was_stop=False)  # took profit -> no cooldown
    assert g.entry_blocked()[0] is False
    g.on_exit(-5.0, was_stop=True)  # stopped out -> cooldown armed
    blocked, why = g.entry_blocked()
    assert blocked and "재진입 금지" in why


def test_cooldown_expires(bot):
    g = _guard(bot, cooldown_minutes=30)
    g.roll_day()
    g.on_exit(-5.0, was_stop=True)
    assert g.entry_blocked()[0] is True
    g._cooldown_until -= 31 * 60
    assert g.entry_blocked()[0] is False


def test_zero_cooldown_never_blocks(bot):
    g = _guard(bot, cooldown_minutes=0)
    g.roll_day()
    g.on_exit(-5.0, was_stop=True)
    assert g.entry_blocked()[0] is False


# --- stop-vs-profit classification (drives the cooldown) ----------------
@pytest.mark.parametrize(
    "side,price,expected",
    [
        ("long", 94.0, True),    # fell through the 5% stop
        ("long", 110.0, False),  # profit exit
        ("short", 106.0, True),  # rose through the stop
        ("short", 90.0, False),  # profit exit
    ],
)
def test_was_stop_exit(bot, side, price, expected):
    t = {"sl_pct": 5.0}
    assert bot["_was_stop_exit"](t, price, 100.0, side) is expected


def test_was_stop_exit_without_stop_loss(bot):
    assert bot["_was_stop_exit"]({"sl_pct": None}, 10.0, 100.0, "long") is False


# --- wiring -------------------------------------------------------------
def test_strategy_targets_exposes_risk_block(bot):
    macro = {
        "rule_type": "A",
        "params": {"take_profit_pct": 3.0, "initial_capital": 1000.0},
        "risk": {"stop_loss_pct": 2.0, "daily_max_loss_pct": 5.0,
                 "max_holding_hours": 4, "cooldown_minutes": 15, "invest_ratio": 0.5},
    }
    t = bot["_strategy_targets"](macro)
    assert t["risk"]["daily_max_loss_pct"] == 5.0
    g = bot["RiskGuard"](t["risk"], t["capital"] * t["invest_ratio"])
    d = g.describe()
    assert "일일최대손실" in d and "최대보유" in d and "재진입금지" in d


def test_describe_reports_nothing_when_unset(bot):
    assert "설정 없음" in _guard(bot).describe()
