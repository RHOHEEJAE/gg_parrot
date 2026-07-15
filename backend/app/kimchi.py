"""Kimchi-premium aggregator (reference indicator only, NOT a trading signal).

Combines three PUBLIC, unauthenticated price sources into a single number:

    premium(%) = (upbit_krw / (binance_usdt * usdkrw) - 1) * 100

The frontend polls one backend endpoint (``/api/kimchi-premium``) instead of
hitting the exchanges directly, which sidesteps browser CORS and shares a short
in-memory cache across all viewers. Every external call is wrapped so a single
source failing (esp. the FX API) degrades gracefully with a fallback rate.
"""
from __future__ import annotations

import os
import time
from typing import Optional

import httpx

_UPBIT = "https://api.upbit.com/v1/ticker"
# Env-configurable base so a US-hosted deploy can use data-api.binance.vision
# (api.binance.com is geo-blocked from US IPs). Same public data either way.
_BINANCE_BASE = os.environ.get("BINANCE_API_BASE", "https://api.binance.com").rstrip("/")
_BINANCE = f"{_BINANCE_BASE}/api/v3/ticker/price"
_FX = "https://open.er-api.com/v6/latest/USD"  # free, no key; rates.KRW

# Supported reference coins -> (upbit market, binance symbol).
_MARKETS: dict[str, tuple[str, str]] = {
    "BTC": ("KRW-BTC", "BTCUSDT"),
    "ETH": ("KRW-ETH", "ETHUSDT"),
    "XRP": ("KRW-XRP", "XRPUSDT"),
    "SOL": ("KRW-SOL", "SOLUSDT"),
}

CACHE_SECONDS = float(os.environ.get("KIMCHI_CACHE_SECONDS", "10"))
FX_FALLBACK = float(os.environ.get("KIMCHI_FX_FALLBACK", "1380.0"))

# component caches: key -> (value, expires_at)
_cache: dict[str, tuple[float, float]] = {}


def supported_symbols() -> list[str]:
    return list(_MARKETS.keys())


def _cached(key: str) -> Optional[float]:
    hit = _cache.get(key)
    if hit and hit[1] > time.time():
        return hit[0]
    return None


def _store(key: str, value: float) -> float:
    _cache[key] = (value, time.time() + CACHE_SECONDS)
    return value


def _upbit_price(market: str) -> Optional[float]:
    key = f"upbit:{market}"
    cached = _cached(key)
    if cached is not None:
        return cached
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(_UPBIT, params={"markets": market})
            resp.raise_for_status()
            price = float(resp.json()[0]["trade_price"])
            return _store(key, price)
    except Exception:
        return None


def _binance_price(symbol: str) -> Optional[float]:
    key = f"binance:{symbol}"
    cached = _cached(key)
    if cached is not None:
        return cached
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(_BINANCE, params={"symbol": symbol})
            resp.raise_for_status()
            price = float(resp.json()["price"])
            return _store(key, price)
    except Exception:
        return None


def _usdkrw() -> tuple[float, bool]:
    """Return (rate, is_fallback). Falls back to a constant when the FX API fails."""
    key = "fx:USDKRW"
    cached = _cached(key)
    if cached is not None:
        return cached, False
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(_FX)
            resp.raise_for_status()
            rate = float(resp.json()["rates"]["KRW"])
            return _store(key, rate), False
    except Exception:
        return FX_FALLBACK, True


def get_premium(symbol: str = "BTC") -> dict:
    """Aggregate the current kimchi premium for ``symbol`` (default BTC).

    Never raises for a missing source; the caller renders whatever fields are
    present. ``ok`` is False when a required price is unavailable.
    """
    coin = (symbol or "BTC").upper()
    if coin not in _MARKETS:
        coin = "BTC"
    upbit_market, binance_symbol = _MARKETS[coin]

    upbit = _upbit_price(upbit_market)
    binance = _binance_price(binance_symbol)
    fx_rate, fx_fallback = _usdkrw()

    result: dict = {
        "symbol": coin,
        "upbit_market": upbit_market,
        "binance_symbol": binance_symbol,
        "upbit_price_krw": round(upbit, 2) if upbit is not None else None,
        "binance_price_usdt": round(binance, 4) if binance is not None else None,
        "usdkrw": round(fx_rate, 2),
        "fx_is_fallback": fx_fallback,
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "disclaimer": "reference only; not investment advice",
    }

    if upbit is None or binance is None:
        result["ok"] = False
        result["error"] = "upbit" if upbit is None else "binance"
        result["premium_pct"] = None
        return result

    binance_krw = binance * fx_rate
    premium = (upbit / binance_krw - 1.0) * 100.0
    result["ok"] = True
    result["binance_price_krw"] = round(binance_krw, 2)
    result["premium_pct"] = round(premium, 3)
    result["label"] = "김프" if premium >= 0 else "역프"
    return result
