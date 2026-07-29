"""AI 원인 분석 층 — BYOK key, graceful fallback, error surfacing, parsing.

No real network calls: the Gemini HTTP client is monkeypatched. Verifies the
feature is OFF (rule-based) without a key, degrades to rule-based on bad/failed
responses (raising AiError with a friendly message from ``generate``), and maps a
well-formed model reply onto the Explanation schema with the key sent in a header.
"""
from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import ai_explain
from app.ai_explain import AiError
from app.engine.backtest import BacktestResult
from app.engine.explain import Explanation
from app.engine.schema import Macro
from app.main import app

client = TestClient(app)


def _macro():
    return Macro(symbol="BTCUSDT", rule_type="A", candle_interval="1d",
                 params=dict(take_profit_pct=5, initial_capital=1_000_000),
                 risk={"stop_loss_pct": 3})


def _result():
    return BacktestResult(
        final_return_pct=12.0, win_rate_pct=60.0, mdd_pct=9.0, total_trades=10,
        initial_capital=1_000_000.0, final_equity=1_120_000.0, equity_curve=[],
        buy_hold_return_pct=5.0,
    )


class _FakeResp:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload


class _FakeClient:
    """Stands in for httpx.Client; returns a canned generateContent body."""

    def __init__(self, model_json, capture=None, status_code=200):
        self._model_json = model_json
        self._capture = capture
        self._status = status_code

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, headers=None, json=None):
        if self._capture is not None:
            self._capture["url"] = url
            self._capture["headers"] = headers or {}
        body = {"candidates": [{"content": {"parts": [{"text": self._model_json}]}}]}
        return _FakeResp(body, status_code=self._status)


def _good_json():
    return json.dumps({
        "mood": "win",
        "headline": "익절 목표가 촘촘해 추세를 놓쳤어",
        "points": ["승률은 60%지만 홀딩보다 앞섰어", "MDD 9%로 낙폭은 얕았어"],
    }, ensure_ascii=False)


def test_no_key_returns_rule_based(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    out = ai_explain.enrich(_macro(), _result())  # no api_key, no env
    assert isinstance(out, Explanation)
    assert out.source == "rule"


def test_byok_key_generates_ai_and_uses_header(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)  # env empty; key comes per-call
    captured = {}
    monkeypatch.setattr(ai_explain.httpx, "Client",
                        lambda *a, **k: _FakeClient(_good_json(), captured))
    out = ai_explain.generate(_macro(), _result(), api_key="user-key-123")
    assert out.source == "ai"
    assert out.mood == "win"
    assert len(out.points) == 2
    # BYOK key must travel in a header, never in the URL.
    assert captured["headers"].get("x-goog-api-key") == "user-key-123"
    assert "user-key-123" not in captured["url"]


def test_env_key_path_still_works(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "env-key")
    monkeypatch.setattr(ai_explain.httpx, "Client", lambda *a, **k: _FakeClient(_good_json()))
    out = ai_explain.enrich(_macro(), _result())
    assert out.source == "ai"


def test_incomplete_reply_raises_aierror(monkeypatch):
    bad = json.dumps({"mood": "win", "headline": "", "points": []})
    monkeypatch.setattr(ai_explain.httpx, "Client", lambda *a, **k: _FakeClient(bad))
    with pytest.raises(AiError):
        ai_explain.generate(_macro(), _result(), api_key="k")


def test_auth_status_raises_friendly_aierror(monkeypatch):
    monkeypatch.setattr(ai_explain.httpx, "Client",
                        lambda *a, **k: _FakeClient("{}", status_code=403))
    with pytest.raises(AiError) as ei:
        ai_explain.generate(_macro(), _result(), api_key="bad")
    assert "키" in ei.value.user_message  # mentions the key problem


def test_network_error_raises_aierror(monkeypatch):
    class _Boom:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, *a, **k):
            raise httpx.ConnectError("down")

    monkeypatch.setattr(ai_explain.httpx, "Client", lambda *a, **k: _Boom())
    with pytest.raises(AiError):
        ai_explain.generate(_macro(), _result(), api_key="k")
    # enrich swallows it and falls back to rule-based.
    assert ai_explain.enrich(_macro(), _result(), api_key="k").source == "rule"


def test_endpoint_reports_ai_unavailable_without_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    body = {
        "macro": {
            "symbol": "BTCUSDT", "rule_type": "A", "candle_interval": "1d",
            "params": {"take_profit_pct": 5, "initial_capital": 1_000_000},
            "risk": {"stop_loss_pct": 3}, "period": {"preset": "3m"},
        }
        # no api_key -> feature off
    }
    res = client.post("/api/explain/ai", json=body)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ai_available"] is False
    assert data["explanation"]["source"] == "rule"
