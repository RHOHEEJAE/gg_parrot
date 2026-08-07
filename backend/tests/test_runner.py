"""매크로 실행기 연동 엔드포인트.

회원 키 발급/재발급, 실행기 세션 start→heartbeat→원격 종료(stop_mode)→stopped,
그리고 소유권/인증 경계(남의 세션 조작 불가, 잘못된 키 401)를 검증한다.
SQLite(테스트)로 돈다.
"""
from __future__ import annotations

import secrets

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _fresh(prefix="run"):
    tok = secrets.token_hex(4)
    return f"{prefix}{tok}@ex.com", f"{prefix}_{tok}"


def _signup() -> str:
    email, username = _fresh()
    body = client.post(
        "/api/auth/signup",
        json={"email": email, "username": username, "password": "password123"},
    ).json()
    return body["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- 회원 키 ------------------------------------------------------------
def test_key_is_issued_once_and_stable():
    token = _signup()
    k1 = client.get("/api/me/runner/key", headers=_auth(token)).json()["key"]
    k2 = client.get("/api/me/runner/key", headers=_auth(token)).json()["key"]
    assert k1 and k1 == k2  # 계정당 1개, 재조회해도 동일


def test_key_regenerate_changes_and_invalidates_old():
    token = _signup()
    old = client.get("/api/me/runner/key", headers=_auth(token)).json()["key"]
    new = client.post("/api/me/runner/key/regenerate", headers=_auth(token)).json()["key"]
    assert new != old
    # 옛 키로 세션 시작 시 401
    r = client.post("/api/runner/start", json={"symbol": "BTCUSDT"}, headers={"X-Runner-Key": old})
    assert r.status_code == 401
    # 새 키는 동작
    r2 = client.post("/api/runner/start", json={"symbol": "BTCUSDT"}, headers={"X-Runner-Key": new})
    assert r2.status_code == 200


def test_start_requires_valid_key():
    assert client.post("/api/runner/start", json={"symbol": "BTCUSDT"}).status_code == 422 or \
        client.post("/api/runner/start", json={"symbol": "BTCUSDT"},
                    headers={"X-Runner-Key": ""}).status_code == 401
    r = client.post("/api/runner/start", json={"symbol": "BTCUSDT"}, headers={"X-Runner-Key": "nope"})
    assert r.status_code == 401


# --- 세션 수명주기 + 원격 종료 -----------------------------------------
def test_full_lifecycle_stop_only():
    token = _signup()
    key = client.get("/api/me/runner/key", headers=_auth(token)).json()["key"]

    # start (숏 매크로 → 선물로 결정되는지 확인)
    start = client.post(
        "/api/runner/start",
        json={"symbol": "ethusdt", "position_side": "short", "leverage": 3,
              "human_summary": "테스트 매크로"},
        headers={"X-Runner-Key": key},
    ).json()
    sid = start["session_id"]
    assert start["poll_seconds"] >= 1

    # 첫 heartbeat: 종료명령 없음
    hb = client.post(
        "/api/runner/heartbeat",
        json={"session_id": sid, "in_position": True, "last_price": 3000.0,
              "entry_price": 2950.0, "position_qty": 0.1, "realized_pnl": 1.5,
              "unrealized_pct": -1.7},
        headers={"X-Runner-Key": key},
    ).json()
    assert hb["action"] == "continue"

    # 마이페이지 목록에 활성으로 보이고 스냅샷이 반영됨
    sessions = client.get("/api/me/runner/sessions", headers=_auth(token)).json()
    assert sessions["active"] and sessions["active"][0]["session_id"] == sid
    view = sessions["active"][0]
    assert view["market"] == "futures" and view["symbol"] == "ETHUSDT"
    assert view["in_position"] is True and view["last_price"] == 3000.0

    # 원격 종료 요청(매크로만)
    client.post(f"/api/me/runner/sessions/{sid}/request-stop",
                json={"mode": "stop_only"}, headers=_auth(token))

    # 다음 heartbeat 가 종료명령을 받아감
    hb2 = client.post("/api/runner/heartbeat", json={"session_id": sid},
                      headers={"X-Runner-Key": key}).json()
    assert hb2["action"] == "stop_only"

    # 실행기가 종료 확정 보고
    client.post("/api/runner/stopped",
                json={"session_id": sid, "status": "stopped", "note": "매크로만 종료 — 포지션 유지"},
                headers={"X-Runner-Key": key})

    after = client.get("/api/me/runner/sessions", headers=_auth(token)).json()
    assert not after["active"]
    assert any(s["session_id"] == sid and s["status"] == "stopped" for s in after["recent"])


def test_request_stop_close_and_stop_action():
    token = _signup()
    key = client.get("/api/me/runner/key", headers=_auth(token)).json()["key"]
    sid = client.post("/api/runner/start", json={"symbol": "BTCUSDT"},
                      headers={"X-Runner-Key": key}).json()["session_id"]
    client.post(f"/api/me/runner/sessions/{sid}/request-stop",
                json={"mode": "close_and_stop"}, headers=_auth(token))
    hb = client.post("/api/runner/heartbeat", json={"session_id": sid},
                     headers={"X-Runner-Key": key}).json()
    assert hb["action"] == "close_and_stop"


def test_invalid_stop_mode_rejected():
    token = _signup()
    key = client.get("/api/me/runner/key", headers=_auth(token)).json()["key"]
    sid = client.post("/api/runner/start", json={"symbol": "BTCUSDT"},
                      headers={"X-Runner-Key": key}).json()["session_id"]
    r = client.post(f"/api/me/runner/sessions/{sid}/request-stop",
                    json={"mode": "nuke"}, headers=_auth(token))
    assert r.status_code == 400


def test_cannot_stop_another_users_session():
    # A 가 세션을 만들고, B 가 종료를 시도하면 404(소유권 경계).
    token_a = _signup()
    key_a = client.get("/api/me/runner/key", headers=_auth(token_a)).json()["key"]
    sid = client.post("/api/runner/start", json={"symbol": "BTCUSDT"},
                      headers={"X-Runner-Key": key_a}).json()["session_id"]
    token_b = _signup()
    r = client.post(f"/api/me/runner/sessions/{sid}/request-stop",
                    json={"mode": "stop_only"}, headers=_auth(token_b))
    assert r.status_code == 404


def test_heartbeat_on_missing_session_tells_runner_to_stop():
    token = _signup()
    key = client.get("/api/me/runner/key", headers=_auth(token)).json()["key"]
    hb = client.post("/api/runner/heartbeat", json={"session_id": 999999},
                     headers={"X-Runner-Key": key}).json()
    assert hb["action"] == "stop_only"


# --- 매크로 파일 다운로드 ----------------------------------------------
def test_macro_file_download():
    macro = {
        "symbol": "BTCUSDT", "rule_type": "A", "position_side": "long",
        "params": {"take_profit_pct": 3.0, "initial_capital": 1000000},
        "risk": {"invest_ratio": 0.5, "stop_loss_pct": 2.0},
        "period": {"preset": "3m"},
    }
    r = client.post("/api/realtrade/macro-file", json={"macro": macro})
    assert r.status_code == 200, r.text
    assert "attachment" in r.headers.get("content-disposition", "")
    body = r.json()
    assert body["symbol"] == "BTCUSDT" and "human_summary" in body
