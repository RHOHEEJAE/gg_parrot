"""Live candle feed for the chart widget (public market data only).

Thin cached wrapper over :func:`data.get_recent_klines`. The cache is GLOBAL and
short (a few seconds), so N browsers polling the same symbol collapse into at
most one Binance call per window — the same pattern used by hot-coins/kimchi.

Why a separate path from the backtest loader: ``data.get_klines`` is cache-first
and persists whatever it fetched, including the still-forming bar. That is
correct for settled history but would freeze a live chart, so the chart reads
:func:`get_recent_klines`, which always refetches and never stores the open bar.
"""
from __future__ import annotations

import os
import time
from typing import Optional

from .data import NoSpotDataError, get_recent_klines

# Supported intervals -> how long a chart response stays fresh. Bars only settle
# once per interval, so polling much faster than this buys nothing; the frontend
# still animates the open bar every tick using the live ticker price.
_INTERVALS: dict[str, float] = {
    "1m": 3.0,
    "3m": 5.0,
    "5m": 5.0,
    "15m": 10.0,
    "1h": 15.0,
    "4h": 30.0,
    "1d": 60.0,
}
DEFAULT_INTERVAL = "1m"
MAX_LIMIT = int(os.environ.get("CHART_MAX_LIMIT", "300"))

# (symbol, interval, limit, market) -> (payload, expires_at)
_cache: dict[tuple[str, str, int, str], tuple[dict, float]] = {}


def supported_intervals() -> list[str]:
    return list(_INTERVALS)


def get_candles(
    symbol: str,
    interval: str = DEFAULT_INTERVAL,
    limit: int = 120,
    market: str = "spot",
) -> dict:
    """Cached recent candles for ``symbol``.

    Raises :class:`NoSpotDataError` when the symbol has no market and there is no
    cached copy to fall back on (surfaced as a 422 by the route).
    """
    symbol = (symbol or "").upper().strip()
    if not symbol:
        raise NoSpotDataError("종목(symbol)을 입력하세요.")
    if interval not in _INTERVALS:
        interval = DEFAULT_INTERVAL
    if market not in ("spot", "futures"):
        market = "spot"
    limit = max(10, min(int(limit), MAX_LIMIT))

    key = (symbol, interval, limit, market)
    hit = _cache.get(key)
    if hit and hit[1] > time.time():
        return {**hit[0], "cached": True}

    try:
        candles = get_recent_klines(symbol, interval=interval, limit=limit, market=market)
    except NoSpotDataError:
        raise
    except Exception:
        # Transient upstream failure: serve the last good copy rather than
        # blanking a chart the user is watching.
        if hit:
            return {**hit[0], "cached": True, "stale": True}
        raise NoSpotDataError("시세를 불러오지 못했습니다. 잠시 후 다시 시도하세요.")

    payload = {
        "symbol": symbol,
        "interval": interval,
        "market": market,
        "candles": candles,
        "server_time": int(time.time() * 1000),
        "refresh_seconds": _INTERVALS[interval],
        "disclaimer": "public market data; reference only",
    }
    _cache[key] = (payload, time.time() + _INTERVALS[interval])
    return {**payload, "cached": False}
