"""AI 원인 분석(껄무새 해설의 AI 층) — Google Gemini.

SERVER-SIDE ONLY. The Gemini key comes either from the request (BYOK — the user
types their own key in the UI) or from ``GEMINI_API_KEY`` in the environment. It
is sent to Google in a request HEADER (never the URL), never logged, never
stored, and never returned to the client.

The model is given ONLY the already-computed backtest metrics and asked to
explain — clearly and concisely — WHY the result turned out this way. It never
invents numbers, predicts the future, or gives advice (guardrails in ``_SYSTEM``).
On any failure ``generate`` raises :class:`AiError` with a user-friendly Korean
message; ``enrich`` instead swallows it and returns the rule-based baseline.
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

_DEFAULT_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
_TIMEOUT = float(os.environ.get("GEMINI_TIMEOUT", "12"))

# System instruction — the safety contract. Concise, cause-focused, past-only,
# no advice, Korean.
_SYSTEM = (
    "너는 코인 백테스트 결과의 '원인'을 초보에게 짧고 명확하게 설명하는 도우미야. "
    "규칙: (1) 반드시 한국어. (2) 주어진 숫자만 근거로 쓰고 새로운 수치를 지어내지 마. "
    "(3) 과거 결과가 '왜' 이렇게 나왔는지 원인만 분석하고, 미래 예측이나 "
    "'사라/팔아라/추천' 같은 투자 조언은 절대 하지 마. "
    "(4) 쉽고 간결하게, 군더더기 없이. 출력은 지정된 JSON 스키마만."
)

# Structured-output schema. We only ask for the cause analysis; ``lesson`` is
# optional (kept for schema compatibility, usually empty now).
_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "mood": {"type": "string", "enum": list(MOODS)},
        "headline": {"type": "string"},
        "points": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["mood", "headline", "points"],
}

_USER_PROMPT = (
    "다음 백테스트 지표(JSON)를 보고 '왜 이런 결과가 나왔는지' 원인을 분석해줘.\n"
    "- headline: 핵심 원인을 한 문장으로 (간결하게)\n"
    "- points: 원인이 된 요인 2~3개, 각각 한 줄로. 반드시 위 숫자를 근거로.\n"
    "- mood: 결과 분위기 (아래 값 중 하나)\n"
    "지표:\n"
)


class AiError(Exception):
    """Raised by ``generate`` with a user-facing Korean message."""

    def __init__(self, user_message: str) -> None:
        super().__init__(user_message)
        self.user_message = user_message


def ai_available() -> bool:
    """True when a Gemini key is configured via the environment (server default)."""
    return bool(os.environ.get("GEMINI_API_KEY"))


def _facts(macro: Macro, r: BacktestResult) -> str:
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


def generate(
    macro: Macro,
    result: BacktestResult,
    *,
    api_key: str,
    model: Optional[str] = None,
) -> Explanation:
    """Call Gemini and return an AI Explanation. Raises :class:`AiError` on failure."""
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model or _DEFAULT_MODEL}:generateContent"
    )
    payload = {
        "systemInstruction": {"parts": [{"text": _SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": _USER_PROMPT + _facts(macro, result)}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": _RESPONSE_SCHEMA,
            "temperature": 0.6,
        },
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                endpoint,
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.RequestError:
        raise AiError("네트워크 오류로 AI 호출에 실패했어요. 잠시 후 다시 시도해 주세요.")

    if resp.status_code in (400, 401, 403):
        raise AiError("API 키가 유효하지 않거나 권한이 없어요. 키를 다시 확인해 주세요.")
    if resp.status_code == 404:
        raise AiError("모델을 찾을 수 없어요. 모델 이름을 확인해 주세요 (기본: gemini-2.0-flash).")
    if resp.status_code == 429:
        raise AiError("요청이 많아 쿼터를 초과했어요. 잠시 후 다시 시도해 주세요.")
    if resp.status_code >= 400:
        raise AiError("AI 호출에 실패했어요.")

    text = _extract_text(resp.json())
    if not text:
        raise AiError("AI 응답을 해석하지 못했어요.")
    try:
        obj = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        raise AiError("AI 응답 형식이 올바르지 않아요.")

    headline = str(obj.get("headline", "")).strip()
    points = [str(p) for p in obj.get("points", []) if str(p).strip()][:5]
    if not headline or not points:
        raise AiError("AI 응답이 비어 있어요.")

    base_mood = explain_result(macro, result).mood
    mood = obj.get("mood")
    return Explanation(
        mood=mood if mood in MOODS else base_mood,
        headline=headline,
        points=points,
        lesson=str(obj.get("lesson", "")).strip(),
        source="ai",
    )


def enrich(
    macro: Macro,
    result: BacktestResult,
    base: Optional[Explanation] = None,
    *,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
) -> Explanation:
    """Return an AI Explanation, or the rule-based ``base`` on any failure."""
    if base is None:
        base = explain_result(macro, result)
    key = api_key or os.environ.get("GEMINI_API_KEY")
    if not key:
        return base
    try:
        return generate(macro, result, api_key=key, model=model)
    except Exception:
        return base
