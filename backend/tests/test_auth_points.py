"""Account auth + virtual points ledger (foundation for the marketplace).

Runs on SQLite (no DATABASE_URL). Covers signup/login/session, the starter grant,
ledger integrity, overdraft protection, and the 70% creator share on an unlock.
"""
from __future__ import annotations

import secrets

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from app import auth as auth_mod
from app import points as points_mod
from app.db import PointLedger, User, get_session
from app.main import app

client = TestClient(app)


def _fresh(prefix="u"):
    """Globally-unique email/username so tests never collide on the persistent
    dev app.db (which survives across runs)."""
    tok = secrets.token_hex(4)  # 8 hex chars -> username stays within 20 chars
    return f"{prefix}{tok}@ex.com", f"{prefix}_{tok}"


# --- auth ---------------------------------------------------------------
def test_signup_grants_starter_points_and_token():
    email, username = _fresh()
    res = client.post("/api/auth/signup", json={"email": email, "username": username, "password": "password123"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["token"]
    assert body["user"]["points_balance"] == points_mod.SIGNUP_GRANT
    assert "password" not in body["user"] and "password_hash" not in body["user"]


def test_signup_rejects_duplicate_email():
    email, username = _fresh()
    client.post("/api/auth/signup", json={"email": email, "username": username, "password": "password123"})
    _, username2 = _fresh()
    res = client.post("/api/auth/signup", json={"email": email, "username": username2, "password": "password123"})
    assert res.status_code == 409


def test_signup_rejects_short_password():
    email, username = _fresh()
    res = client.post("/api/auth/signup", json={"email": email, "username": username, "password": "short"})
    assert res.status_code == 400


def test_login_and_me_roundtrip():
    email, username = _fresh()
    client.post("/api/auth/signup", json={"email": email, "username": username, "password": "password123"})
    res = client.post("/api/auth/login", json={"email": email, "password": "password123"})
    assert res.status_code == 200, res.text
    token = res.json()["token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["user"]["username"] == username


def test_login_wrong_password_rejected():
    email, username = _fresh()
    client.post("/api/auth/signup", json={"email": email, "username": username, "password": "password123"})
    res = client.post("/api/auth/login", json={"email": email, "password": "wrongpass1"})
    assert res.status_code == 401


def test_me_requires_valid_token():
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"}).status_code == 401


# --- points ledger ------------------------------------------------------
def _make_user(prefix) -> int:
    email, username = _fresh(prefix)
    body = client.post("/api/auth/signup", json={"email": email, "username": username, "password": "password123"}).json()
    return body["user"]["id"]


def test_apply_records_ledger_and_updates_balance():
    uid = _make_user("ledger")
    with get_session() as db:
        user = db.get(User, uid)
        points_mod.apply(db, user, -250, "unlock_spend", "entry:1")
        db.commit()
        rows = db.exec(select(PointLedger).where(PointLedger.user_id == uid)).all()
        assert user.points_balance == points_mod.SIGNUP_GRANT - 250
        # signup_grant + this debit; the debit's balance_after must match.
        debit = [r for r in rows if r.reason == "unlock_spend"][0]
        assert debit.delta == -250
        assert debit.balance_after == points_mod.SIGNUP_GRANT - 250


def test_overdraft_is_rejected():
    uid = _make_user("broke")
    with get_session() as db:
        user = db.get(User, uid)
        with pytest.raises(points_mod.InsufficientPoints):
            points_mod.apply(db, user, -(points_mod.SIGNUP_GRANT + 1), "unlock_spend")


def test_unlock_transfer_pays_creator_70_percent():
    viewer_id = _make_user("viewer")
    creator_id = _make_user("creator")
    price = 100
    with get_session() as db:
        viewer = db.get(User, viewer_id)
        creator = db.get(User, creator_id)
        share = points_mod.unlock_transfer(db, viewer=viewer, creator=creator, entry_id=42, price=price)
        db.commit()
        db.refresh(viewer)
        db.refresh(creator)
    assert share == 70
    assert viewer.points_balance == points_mod.SIGNUP_GRANT - price
    assert creator.points_balance == points_mod.SIGNUP_GRANT + 70  # 30% is the platform sink


def test_unlock_transfer_is_atomic_on_overdraft():
    # A viewer who can't afford the price leaves BOTH balances untouched.
    viewer_id = _make_user("poorviewer")
    creator_id = _make_user("richcreator")
    with get_session() as db:
        viewer = db.get(User, viewer_id)
        creator = db.get(User, creator_id)
        with pytest.raises(points_mod.InsufficientPoints):
            points_mod.unlock_transfer(db, viewer=viewer, creator=creator, entry_id=7, price=points_mod.SIGNUP_GRANT + 500)
        db.rollback()
    with get_session() as db:
        assert db.get(User, viewer_id).points_balance == points_mod.SIGNUP_GRANT
        assert db.get(User, creator_id).points_balance == points_mod.SIGNUP_GRANT
