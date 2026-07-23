"""'고래 동향' pure logic: denylist filtering and balance diffing.

Network fetches and SQLite persistence are intentionally not covered here — the
value is in the classification rules, which must never mistake a new entrant for
a buy or count an exchange wallet at all.
"""
from __future__ import annotations

from app.whales import COINS, diff_holders, filter_holders, mood


def _h(wallet, balance):
    return {"wallet": wallet, "balance": str(balance)}


# --- denylist -----------------------------------------------------------
def test_filter_drops_burn_and_null_and_contract():
    holders = [
        _h("0x0000000000000000000000000000000000000000", 5),  # null
        _h("0x000000000000000000000000000000000000dEaD", 5),  # burn (mixed case)
        _h("0xAbC0000000000000000000000000000000000001", 5),  # the token itself
        _h("0xWhale1", 5),
    ]
    kept, excluded = filter_holders(holders, contract="0xabc0000000000000000000000000000000000001")
    assert [h["wallet"] for h in kept] == ["0xWhale1"]
    assert excluded == 3


def test_filter_drops_known_exchange_wallet():
    holders = [_h("0xF977814e90dA44bFA03b6295A0616a897441aceC", 9), _h("0xWhale1", 9)]
    kept, excluded = filter_holders(holders)
    assert [h["wallet"] for h in kept] == ["0xWhale1"]
    assert excluded == 1


# --- diffing ------------------------------------------------------------
def test_diff_counts_buys_and_sells():
    prev = {"a": "100", "b": "100", "c": "100"}
    now = [_h("a", 150), _h("b", 50), _h("c", 100)]  # up, down, unchanged
    assert diff_holders(prev, now) == {"buys": 1, "sells": 1, "new": 0, "net": 0}


def test_new_entrant_is_not_a_buy():
    # A wallet appearing for the first time has no baseline; counting it as a buy
    # would make every list reshuffle look like accumulation.
    prev = {"a": "100"}
    now = [_h("a", "100"), _h("brand_new", "999999")]
    d = diff_holders(prev, now)
    assert d["buys"] == 0 and d["sells"] == 0 and d["new"] == 1


def test_diff_handles_huge_and_malformed_balances():
    prev = {"a": "1" + "0" * 30, "bad": "not-a-number"}
    now = [_h("a", "9" + "0" * 30), _h("bad", "12")]  # 18-decimal scale, plus junk
    d = diff_holders(prev, now)
    assert d["buys"] == 1  # big ints must not lose precision via float
    assert d["sells"] == 0


def test_empty_previous_snapshot_yields_no_signal():
    assert diff_holders({}, [_h("a", 1), _h("b", 2)])["net"] == 0


# --- presentation -------------------------------------------------------
def test_mood_reflects_flow_direction():
    assert "담는" in mood(4, 5, 1)
    assert "내다파는" in mood(-4, 1, 5)
    assert "조용" in mood(0, 0, 0)


def test_every_coin_maps_to_a_usdt_pair():
    # The banner links each coin into the builder via ?symbol=, so the mapping
    # must be a real Binance-style pair.
    for cfg in COINS.values():
        assert cfg["symbol"].endswith("USDT")
        assert cfg["ttl"] > 0
