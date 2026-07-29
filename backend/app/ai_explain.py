"""Optional AI enrichment of the rule-based 껄무새 해설 (Google Gemini).

SERVER-SIDE ONLY. Reads ``GEMINI_API_KEY`` from the environment and calls the
Gemini REST API (via the already-present ``httpx``) with the key in a request
HEADER — never in the URL, never logged, never returned to the client. If the
key is missing or the call fails/times out/returns junk, ``enrich`` returns the
deterministic rule-based :class:`Explanation` unchanged, so the feature always
degrades gracefully instead of erroring.

The model is given ONLY the already-computed metrics and told to translate them
into the same ``Explanation`` shape (JSON mode) — it never invents numbers,
predicts the future, or gives advice. Those guardrails live in ``_SYSTEM``.
"""
from __future__ import annotations

import json
import os
from typing import Optional

import httpx

from .engine.backtest import BacktestResult
from .engine.explain import MOODS, Explanation, explain_result
from .engine.schema import Macro
from .engine.summary import human_summary

_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{_MODEL}:generateContent"
_TIMEOUT = float(os.environ.get("GEMINI_TIMEOUT", "12"))

# System instruction — the safety contract. Past-tense narration of THIS result
# only; no advice, no prediction, Korean, 껄무새(후회하는 앵무새) 캐릭터 톤.
_SYSTEM = (
    "너는 코인 백테스트 결과를 초보에게 설명해주는 '껄무새'(후회하는 앵무새) 캐릭터야. "
    "규칙: (1) 반드시 한국어. (2) 주어진 숫자만 사용하고 새 수치를 지어내지 마. "
    "(3) 과거 시뮬레이션 결과만 설명하고 미래를 예측하지 마. "
    "(4) '사라/팔아라/추천' 같은 투자 조언·권유는 절대 금지. "
    "(5) 친근하고 위트있게, 하지만 교육적으로. "
    "출력은 반드시 지정된 JSON 스키마만."
)

# Gemini structured-output schema -> maps 1:1 onto Explanation fields we let the
# model write (source/disclaimer are fixed server-side).
_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "mood": {"type": "string", "enum": list(MOODS)},
        "headline": {"type": "string"},
        "points": {"type": "array", "items": {"type": "string"}},
        "lesson": {"type": "string"},
    },
    "required": ["mood", "headline", "points", "lesson"],
}


def ai_available() -> bool:
    """True when a Gemini key is configured (feature is on)."""
    return bool(os.environ.get("GEMINI_API_KEY"))


def _facts(macro: Macro, r: BacktestResult) -> str:
    """The only ground truth the model may use — the computed metrics."""
    return json.dumps(
        {
            "요약": human_summary(macro),
            "종목": macro.symbol,
            "레버리지": macro.leverage,
            "최종수익률%": r.final_return_pct,
            "그냥홀딩수익률%": r.buy_hold_return_pct,
            "MDD%": r.mdd_pct,
            "승률%": r.win_rate_pct,
            "총매매횟수": r.total_trades,
            "샤프지수": r.sharpe,
            "손익비": r.profit_factor,
            "최대연속손절": r.max_consecutive_losses,
            "청산횟수": r.liquidation_count,
        },
        ensure_ascii=False,
    )


def _extract_text(data: dict) -> Optional[str]:
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        return None


def enrich(macro: Macro, result: BacktestResult, base: Optional[Explanation] = None) -> Explanation:
    """Return an AI-written Explanation, or ``base`` (rule-based) on any failure."""
    if base is None:
        base = explain_result(macro, result)
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        return base

    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text":
            "다음 백테스트 지표(JSON)를 껄무새 톤으로 해설해줘. "
            "points 는 각 항목이 위 숫자에 근거한 관찰 2~4개, lesson 은 교훈 1개.\n" + _facts(macro, result)
        }]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _RESPONSE_SCHEMA,
            "temperature": 0.7,
        },
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                _ENDPOINT,
                headers={"x-goog-api-key": key, "Content-Type": "application/json"},
                json=payload,
            )
            resp.raise_for_status()
            text = _extract_text(resp.json())
        if not text:
            return base
        obj = json.loads(text)
        mood = obj.get("mood")
        points = [str(p) for p in obj.get("points", []) if str(p).strip()][:5]
        headline = str(obj.get("headline", "")).strip()
        lesson = str(obj.get("lesson", "")).strip()
        if not headline or not lesson or not points:
            return base  # incomplete -> keep the reliable baseline
        return Explanation(
            mood=mood if mood in MOODS else base.mood,
            headline=headline,
            points=points,
            lesson=lesson,
            source="ai",
        )
    except Exception:
        # Network / auth / quota / malformed JSON -> silent, safe fallback.
        return base
