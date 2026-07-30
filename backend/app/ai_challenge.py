"""Generate the daily challenge's macros (OpenAI, with a safe template fallback).

The model proposes a few beginner-friendly macros for the chosen symbol; every
proposal is validated against the real :class:`Macro` schema and anything invalid
is dropped. The list is then topped up with deterministic templates so the daily
challenge ALWAYS has exactly N valid macros — even with no key or a bad response.
"""
from __future__ import annotations

import json
import os
from typing import Optional

import httpx

from .engine.schema import Macro

_ENDPOINT = "https://api.openai.com/v1/chat/completions"
_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
_TIMEOUT = float(os.environ.get("OPENAI_TIMEOUT", "20"))

_SYSTEM = (
    "너는 코인 백테스트 교육 데모의 전략 생성기야. 주어진 종목으로 초보용 매크로 "
    "3개를 서로 다른 스타일로 제안해. 반드시 JSON만 출력하고 형식은 "
    '{"macros":[{"rule_type":"A","candle_interval":"1h","params":{...},'
    '"risk":{"stop_loss_pct":3},"position_side":"long"}, ...]}. '
    "rule_type 은 A(익절/손절), E(트레일링), F(RSI), J(이평크로스) 중에서만 고르고 "
    "각 params 는 그 타입에 맞게 채워. initial_capital 은 1000000 으로. "
    "레버리지·숏은 쓰지 마(long, 레버리지 1). 투자 조언 문구는 넣지 마."
)

# type -> the params each needs (mirrors engine.schema). Used for the fallback.
_TEMPLATES = [
    {"rule_type": "A", "candle_interval": "1d",
     "params": {"take_profit_pct": 5, "initial_capital": 1_000_000}, "risk": {"stop_loss_pct": 3}},
    {"rule_type": "E", "candle_interval": "1h",
     "params": {"entry_mode": "immediate", "activation_profit": 5, "trail_percent": 3, "initial_capital": 1_000_000}},
    {"rule_type": "F", "candle_interval": "1h",
     "params": {"rsi_period": 14, "entry_threshold": 30, "exit_threshold": 70, "initial_capital": 1_000_000}},
    {"rule_type": "J", "candle_interval": "1h",
     "params": {"ma_type": "SMA", "fast_period": 20, "slow_period": 60, "initial_capital": 1_000_000}},
]


def _templates(symbol: str) -> list[dict]:
    out = []
    for t in _TEMPLATES:
        m = dict(t)
        m["symbol"] = symbol
        m["position_side"] = "long"
        out.append(m)
    return out


def _valid(macro_dict: dict, symbol: str) -> Optional[dict]:
    try:
        macro_dict = dict(macro_dict)
        macro_dict.setdefault("symbol", symbol)
        macro_dict.setdefault("position_side", "long")
        Macro(**macro_dict)  # raises on anything invalid
        return macro_dict
    except Exception:
        return None


def _ai_propose(symbol: str, key: str) -> list[dict]:
    payload = {
        "model": _MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": f"종목: {symbol}. 이 종목으로 매크로 3개를 JSON으로 제안해줘."},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.8,
    }
    with httpx.Client(timeout=_TIMEOUT) as client:
        resp = client.post(
            _ENDPOINT,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json=payload,
        )
    resp.raise_for_status()
    text = resp.json()["choices"][0]["message"]["content"]
    obj = json.loads(text)
    macros = obj.get("macros", obj if isinstance(obj, list) else [])
    return macros if isinstance(macros, list) else []


def generate_macros(symbol: str, n: int = 3) -> list[dict]:
    """Return exactly ``n`` valid macro dicts for ``symbol`` (AI + template fill)."""
    proposed: list[dict] = []
    key = os.environ.get("OPENAI_API_KEY")
    if key:
        try:
            proposed = _ai_propose(symbol, key)
        except Exception:
            proposed = []

    valid: list[dict] = []
    for m in proposed:
        v = _valid(m, symbol)
        if v is not None:
            valid.append(v)
        if len(valid) >= n:
            break
    # Top up (or fully fall back) with deterministic templates.
    for t in _templates(symbol):
        if len(valid) >= n:
            break
        valid.append(t)
    return valid[:n]
