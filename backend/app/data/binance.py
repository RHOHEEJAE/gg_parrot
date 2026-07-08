"""Binance public klines fetch + local SQLite cache.

Only the *public* historical klines REST endpoint is used (no auth, no orders).
Fetched bars are cached in ``cache/market.db`` so re-running the same window
never re-hits the network. If Binance is unreachable and the cache can't cover
the window, a deterministic synthetic series is generated so the app still
demos offline (the response's ``source`` field flags this).
"""
from __future__ import annotations

import math
import os
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
import pandas as pd

_BASE = "https://api.binance.com/api/v3/klines"
_TICKER = "https://api.binance.com/api/v3/ticker/price"
_CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "cache")
_DB_PATH = os.path.join(_CACHE_DIR, "market.db")
_MS_DAY = 86_400_000

COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]

# Shown to users when a symbol has no Binance *spot* market (e.g. futures-only
# or delisted). We refuse to simulate rather than fabricate synthetic returns.
NO_SPOT_MSG = "이 종목은 현물 시세 데이터가 없어 시뮬레이션할 수 없습니다."


class NoSpotDataError(Exception):
    """Raised when a symbol has no usable Binance spot price data."""


# --- period presets -----------------------------------------------------
def resolve_period(preset: Optional[str], start: Optional[str], end: Optional[str]) -> tuple[int, int]:
    """Resolve a period into (start_ms, end_ms) UTC epoch milliseconds."""
    now = datetime.now(timezone.utc)
    if preset and preset != "custom":
        days = {"1y": 365, "6m": 182, "3m": 91}.get(preset)
        if days is None:
            raise ValueError(f"unknown period preset: {preset}")
        start_dt = now - timedelta(days=days)
        end_dt = now
    else:
        if not start or not end:
            raise ValueError("custom period requires start and end (ISO dates)")
        start_dt = datetime.fromisoformat(start).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(end).replace(tzinfo=timezone.utc)
    return int(start_dt.timestamp() * 1000), int(end_dt.timestamp() * 1000)


# --- cache --------------------------------------------------------------
def _conn() -> sqlite3.Connection:
    os.makedirs(_CACHE_DIR, exist_ok=True)
    conn = sqlite3.connect(_DB_PATH)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS klines (
               symbol TEXT, interval TEXT, open_time INTEGER,
               open REAL, high REAL, low REAL, close REAL, volume REAL,
               PRIMARY KEY (symbol, interval, open_time))"""
    )
    return conn


def _read_cache(symbol: str, interval: str, start_ms: int, end_ms: int) -> pd.DataFrame:
    with _conn() as conn:
        rows = conn.execute(
            """SELECT open_time, open, high, low, close, volume FROM klines
               WHERE symbol=? AND interval=? AND open_time BETWEEN ? AND ?
               ORDER BY open_time""",
            (symbol, interval, start_ms, end_ms),
        ).fetchall()
    if not rows:
        return pd.DataFrame(columns=COLUMNS)
    df = pd.DataFrame(rows, columns=["open_time", "open", "high", "low", "close", "volume"])
    df["timestamp"] = pd.to_datetime(df["open_time"], unit="ms", utc=True)
    return df[COLUMNS]


def _write_cache(symbol: str, interval: str, raw: list[list]) -> None:
    with _conn() as conn:
        conn.executemany(
            """INSERT OR REPLACE INTO klines
               (symbol, interval, open_time, open, high, low, close, volume)
               VALUES (?,?,?,?,?,?,?,?)""",
            [
                (symbol, interval, int(k[0]), float(k[1]), float(k[2]),
                 float(k[3]), float(k[4]), float(k[5]))
                for k in raw
            ],
        )


# --- network fetch ------------------------------------------------------
def _fetch_binance(symbol: str, interval: str, start_ms: int, end_ms: int) -> list[list]:
    out: list[list] = []
    cursor = start_ms
    with httpx.Client(timeout=15.0) as client:
        while cursor < end_ms:
            resp = client.get(
                _BASE,
                params={
                    "symbol": symbol,
                    "interval": interval,
                    "startTime": cursor,
                    "endTime": end_ms,
                    "limit": 1000,
                },
            )
            resp.raise_for_status()
            batch = resp.json()
            if not batch:
                break
            out.extend(batch)
            last_open = int(batch[-1][0])
            cursor = last_open + _MS_DAY
            if len(batch) < 1000:
                break
    return out


# --- synthetic offline fallback -----------------------------------------
def _synthetic(symbol: str, start_ms: int, end_ms: int) -> pd.DataFrame:
    """Deterministic price walk (seeded by symbol) for offline demos."""
    seed = sum(ord(ch) for ch in symbol.upper())
    n = max(2, (end_ms - start_ms) // _MS_DAY)
    base = 100.0 + (seed % 500)
    times, closes = [], []
    price = base
    for i in range(n):
        # smooth deterministic oscillation + slow drift (no randomness)
        wave = math.sin((i + seed) / 9.0) * 0.05 + math.sin((i + seed) / 23.0) * 0.03
        price *= (1.0 + wave * 0.2 + 0.0005)
        times.append(start_ms + i * _MS_DAY)
        closes.append(round(price, 2))
    df = pd.DataFrame(
        {
            "timestamp": pd.to_datetime(times, unit="ms", utc=True),
            "open": closes,
            "high": [c * 1.01 for c in closes],
            "low": [c * 0.99 for c in closes],
            "close": closes,
            "volume": [0.0] * n,
        }
    )
    return df[COLUMNS]


# --- live ticker (paper trading) ----------------------------------------
def get_ticker_price(symbol: str) -> Optional[float]:
    """Latest spot price via the public ticker endpoint. None if unreachable.

    Read-only public data; no auth, no account, no orders.
    """
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(_TICKER, params={"symbol": symbol.upper()})
            resp.raise_for_status()
            return float(resp.json()["price"])
    except Exception:
        return None


# Shared per-symbol price cache: many paper sessions on the same symbol reuse one
# fetch instead of each hitting Binance (spec: read from a shared cache, don't
# make one external call per entry).
_price_cache: dict[str, tuple[float, float]] = {}


def get_ticker_price_cached(symbol: str, ttl: float = 2.0) -> Optional[float]:
    """Latest spot price, cached for ``ttl`` seconds per symbol."""
    symbol = symbol.upper()
    now = time.time()
    hit = _price_cache.get(symbol)
    if hit and hit[1] > now:
        return hit[0]
    price = get_ticker_price(symbol)
    if price is not None:
        _price_cache[symbol] = (price, now + ttl)
    return price


# --- public API ---------------------------------------------------------
def get_klines(
    symbol: str,
    start_ms: int,
    end_ms: int,
    interval: str = "1d",
    *,
    allow_synthetic: bool = True,
) -> tuple[pd.DataFrame, str]:
    """Return (OHLCV dataframe, source) for the window.

    source is one of: "cache", "binance", "synthetic".

    ``allow_synthetic`` (default True) keeps the offline demo fallback for the
    original share/gallery flows. Backtest and paper pass ``False`` so a symbol
    with no real spot data raises :class:`NoSpotDataError` instead of silently
    producing fabricated returns (v6 safety guard).
    """
    symbol = symbol.upper()
    expected_days = max(1, (end_ms - start_ms) // _MS_DAY)

    cached = _read_cache(symbol, interval, start_ms, end_ms)
    # Consider the cache usable if it covers most of the window.
    if len(cached) >= expected_days * 0.95:
        return cached, "cache"

    try:
        raw = _fetch_binance(symbol, interval, start_ms, end_ms)
        if raw:
            _write_cache(symbol, interval, raw)
            fresh = _read_cache(symbol, interval, start_ms, end_ms)
            if len(fresh) > 0:
                return fresh, "binance"
    except Exception:
        pass  # fall through to cache/synthetic

    if len(cached) > 0:
        return cached, "cache"
    if not allow_synthetic:
        raise NoSpotDataError(NO_SPOT_MSG)
    return _synthetic(symbol, start_ms, end_ms), "synthetic"


def ensure_spot_available(symbol: str) -> None:
    """Raise :class:`NoSpotDataError` if ``symbol`` has no Binance spot market.

    Best-effort: a definitive "invalid symbol" (HTTP 400) is rejected; on a
    network error we accept the symbol only if we already hold cached bars for
    it, so a transient outage never fabricates data for an unknown coin.
    """
    symbol = symbol.upper()
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(_TICKER, params={"symbol": symbol})
            if resp.status_code == 200:
                return
            if resp.status_code == 400:
                raise NoSpotDataError(NO_SPOT_MSG)
            resp.raise_for_status()
    except NoSpotDataError:
        raise
    except Exception:
        pass  # network/unknown -> fall back to the cache check below
    with _conn() as conn:
        row = conn.execute("SELECT 1 FROM klines WHERE symbol=? LIMIT 1", (symbol,)).fetchone()
    if row is None:
        raise NoSpotDataError(NO_SPOT_MSG)
