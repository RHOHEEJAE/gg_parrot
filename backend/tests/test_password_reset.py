"""Password reset: token issue/verify, actual reset, no account enumeration."""
from __future__ import annotations

import secrets

import pytest
from fastapi.testclient import TestClient

from app import auth as auth_mod
from app.main import app

client = TestClient(app)


def _signup():
    tok = secrets.token_hex(4)
    email, username = f"r{tok}@ex.com", f"r_{tok}"
    client.post("/api/auth/signup", json={"email": email, "username": username, "password": "password123"})
    return email


def test_forgot_always_ok_even_for_unknown_email():
    res = client.post("/api/auth/forgot", json={"email": "nobody-xyz@ex.com"})
    assert res.status_code == 200
    assert res.json()["ok"] is True  # no account enumeration


def test_reset_flow_changes_password():
    email = _signup()
    # We can't read the emailed token, so mint it the same way the server does.
    token = auth_mod._make_reset_token(_uid_of(email))

    res = client.post("/api/auth/reset", json={"token": token, "password": "newpassword1"})
    assert res.status_code == 200, res.text

    # Old password no longer works; new one does.
    assert client.post("/api/auth/login", json={"email": email, "password": "password123"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": email, "password": "newpassword1"}).status_code == 200


def test_reset_rejects_bad_token():
    assert client.post("/api/auth/reset", json={"token": "garbage", "password": "newpassword1"}).status_code == 400


def test_reset_rejects_short_password():
    email = _signup()
    token = auth_mod._make_reset_token(_uid_of(email))
    assert client.post("/api/auth/reset", json={"token": token, "password": "short"}).status_code == 400


def test_session_token_cannot_be_used_as_reset_token():
    email = _signup()
    login = client.post("/api/auth/login", json={"email": email, "password": "password123"}).json()
    # A normal session JWT lacks purpose=reset -> must be rejected by reset.
    assert client.post("/api/auth/reset", json={"token": login["token"], "password": "newpassword1"}).status_code == 400


def _uid_of(email: str) -> int:
    from sqlmodel import select
    from app.db import User, get_session
    with get_session() as db:
        return db.exec(select(User).where(User.email == email.lower())).first().id
