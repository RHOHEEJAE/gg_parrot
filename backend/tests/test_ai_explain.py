"""AI enrichment layer — key gating, graceful fallback, response parsing.

No real network calls: the Gemini HTTP client is monkeypatched. Verifies the
feature is OFF (rule-based) without a key, degrades to rule-based on bad/failed
responses, and maps a well-formed model reply onto the Explanation schema.
"""
from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from app import ai_explain
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
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class _FakeClient:
    """Stands in for httpx.Client; returns a canned Gemini generateContent body."""

    def __init__(self, model_json, capture=None):
        self._model_json = model_json
        self._capture = capture

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def post(self, url, headers=None, json=None):
        if self._capture is not None:
            self._capture["url"] = url
            self._capture["headers"] = headers or {}
        return _FakeResp({"candidates": [{"content": {"parts": [{"text": self._model_json}]}}]})


def test_no_key_returns_rule_based(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    assert ai_explain.ai_available() is False
    out = ai_explain.enrich(_macro(), _result())
    assert isinstance(out, Explanation)
    assert out.source == "rule"


def test_valid_model_reply_maps_to_ai_explanation(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    captured = {}
    model_json = json.dumps({
        "mood": "win",
        "headline": "🦜 오 좀 하는데?",
        "points": ["홀딩보다 앞섰어", "MDD도 얕았어"],
        "lesson": "다른 기간에도 되는지 확인해봐.",
    }, ensure_ascii=False)
    monkeypatch.setattr(ai_explain.httpx, "Client", lambda *a, **k: _FakeClient(model_json, captured))

    out = ai_explain.enrich(_macro(), _result())
    assert out.source == "ai"
    assert out.headline.startswith("🦜")
    assert out.mood == "win"
    assert len(out.points) == 2
    # the API key must travel in a header, never in the URL.
    assert captured["headers"].get("x-goog-api-key") == "test-key"
    assert "test-key" not in captured["url"]


def test_incomplete_reply_falls_back(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    bad = json.dumps({"mood": "win", "headline": "", "points": [], "lesson": ""})
    monkeypatch.setattr(ai_explain.httpx, "Client", lambda *a, **k: _FakeClient(bad))
    out = ai_explain.enrich(_macro(), _result())
    assert out.source == "rule"  # missing fields -> keep the reliable baseline


def test_network_error_falls_back(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    class _Boom:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def post(self, *a, **k):
            raise RuntimeError("network down")

    monkeypatch.setattr(ai_explain.httpx, "Client", lambda *a, **k: _Boom())
    out = ai_explain.enrich(_macro(), _result())
    assert out.source == "rule"


def test_endpoint_reports_ai_unavailable_without_key(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    body = {
        "macro": {
            "symbol": "BTCUSDT", "rule_type": "A", "candle_interval": "1d",
            "params": {"take_profit_pct": 5, "initial_capital": 1_000_000},
            "risk": {"stop_loss_pct": 3}, "period": {"preset": "3m"},
        }
    }
    res = client.post("/api/explain/ai", json=body)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["ai_available"] is False
    assert data["explanation"]["source"] == "rule"
