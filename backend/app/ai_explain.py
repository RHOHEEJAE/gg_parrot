"""AI 원인 분석(껄무새 해설의 AI 층) — OpenAI Chat Completions.

SERVER-SIDE ONLY. The key is read from ``OPENAI_API_KEY`` in the environment
(local .env for dev, Render env for deploy) — never hardcoded, never logged,
never returned to the client. There is NO user-supplied key: if the server key
is set the feature is on for everyone; if not, callers fall back to the
deterministic rule-based explanation.

The model is given ONLY the already-computed backtest metrics and asked to
explain — clearly and within 5 lines — WHY the result turned out this way. It
never invents numbers, predicts the future, or gives advice (guardrails in
``_SYSTEM``). ``generate`` raises :class:`AiError` (friendly Korean) on failure;
``enrich`` swallows it and returns the rule-based baseline.
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

_ENDPOINT = "https://api.openai.com/v1/chat/completions"
_DEFAULT_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
_TIMEOUT = float(os.environ.get("OPENAI_TIMEOUT", "15"))

_SYSTEM = (
    "너는 코인 백테스트 결과의 '원인'을 초보에게 짧고 명확하게 설명하는 도우미야. "
    "규칙: (1) 반드시 한국어. (2) 주어진 숫자만 근거로 쓰고 새로운 수치를 지어내지 마. "
    "(3) 과거 결과가 '왜' 이렇게 나왔는지 원인만 분석하고, 미래 예측이나 "
    "'사라/팔아라/추천' 같은 투자 조언은 절대 하지 마. "
    "(4) 쉽고 간결하게. 전체가 headline 1줄 + points 최대 4줄 = 5줄을 넘지 마. "
    "반드시 JSON만 출력: "
    '{"mood": "<' + "|".join(MOODS) + '>", "headline": "<핵심 원인 한 문장>", '
    '"points": ["<숫자 근거 원인 1>", "..."]}'
)

_USER_PROMPT = (
    "다음 백테스트 지표(JSON)를 보고 '왜 이런 결과가 나왔는지' 원인을 분석해서 "
    "지정된 JSON으로만 답해줘. points는 위 숫자를 근거로 한 원인 2~3개.\n지표:\n"
)


class AiError(Exception):
    """Raised by ``generate`` with a user-facing Korean message."""

    def __init__(self, user_message: str) -> None:
        super().__init__(user_message)
        self.user_message = user_message


def ai_available() -> bool:
    """True when the server OpenAI key is configured (feature is on)."""
    return bool(os.environ.get("OPENAI_API_KEY"))


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
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None


def generate(macro: Macro, result: BacktestResult, *, model: Optional[str] = None) -> Explanation:
    """Call OpenAI and return an AI Explanation. Raises :class:`AiError` on failure."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise AiError("서버에 OpenAI 키가 설정되지 않았어요.")
    payload = {
        "model": model or _DEFAULT_MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": _USER_PROMPT + _facts(macro, result)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.6,
    }
    try:
        with httpx.Client(timeout=_TIMEOUT) as client:
            resp = client.post(
                _ENDPOINT,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.RequestError:
        raise AiError("네트워크 오류로 AI 호출에 실패했어요. 잠시 후 다시 시도해 주세요.")

    if resp.status_code in (401, 403):
        raise AiError("OpenAI 키가 유효하지 않거나 권한이 없어요.")
    if resp.status_code == 429:
        # Distinguish "no credits/billing" (insufficient_quota) from a real rate
        # limit, since the fix is completely different.
        code = ""
        try:
            code = str((resp.json().get("error") or {}).get("code") or "")
        except Exception:
            code = ""
        if "insufficient_quota" in code:
            raise AiError("OpenAI 크레딧이 없어요. platform.openai.com 의 Billing에서 결제 수단을 등록하고 크레딧을 충전해 주세요.")
        raise AiError("요청이 몰렸어요(레이트 리밋). 잠시 후 다시 시도해 주세요.")
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
    # Hard cap: headline + up to 4 points = 5 lines max.
    points = [str(p) for p in obj.get("points", []) if str(p).strip()][:4]
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


def enrich(macro: Macro, result: BacktestResult, base: Optional[Explanation] = None) -> Explanation:
    """Return an AI Explanation, or the rule-based ``base`` on any failure."""
    if base is None:
        base = explain_result(macro, result)
    if not ai_available():
        return base
    try:
        return generate(macro, result)
    except Exception:
        return base
