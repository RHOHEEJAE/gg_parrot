"""Account auth: email/password signup & login, JWT session, current-user dep.

Our own auth (not Supabase Auth): passwords are PBKDF2-hashed (see security.py),
sessions are stateless JWTs signed with ``SECRET_KEY``. Supabase is used only as
the durable Postgres store. Keep this the single place that mints/verifies tokens.

Signup grants starter points atomically with account creation, so a new account
always has a matching ledger entry.
"""
from __future__ import annotations

import os
import re
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Header, HTTPException
from sqlmodel import select

from . import points as points_mod
from .db import User, get_session
from .security import hash_password, verify_password

# Dev fallback only (>=32 bytes to satisfy HS256). Deployments MUST set SECRET_KEY.
SECRET_KEY = os.environ.get("SECRET_KEY") or "dev-insecure-secret-change-me-in-production-0123456789"
_JWT_ALGO = "HS256"
_TOKEN_TTL_HOURS = int(os.environ.get("SESSION_TTL_HOURS", "168"))  # 7 days

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_USERNAME_RE = re.compile(r"^[A-Za-z0-9_가-힣]{2,20}$")


class AuthError(HTTPException):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(status_code=status_code, detail=detail)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def make_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "iat": int(_now().timestamp()),
        "exp": int((_now() + timedelta(hours=_TOKEN_TTL_HOURS)).timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=_JWT_ALGO)


def _decode(token: str) -> int:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[_JWT_ALGO])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise AuthError(401, "세션이 만료됐거나 유효하지 않아요. 다시 로그인해 주세요.")


def user_view(user: User) -> dict:
    """Public view of an account — never includes the password hash."""
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "points_balance": user.points_balance,
        "created_at": user.created_at,
    }


def signup(email: str, username: str, password: str) -> dict:
    email = (email or "").strip().lower()
    username = (username or "").strip()
    if not _EMAIL_RE.match(email):
        raise AuthError(400, "이메일 형식이 올바르지 않아요.")
    if not _USERNAME_RE.match(username):
        raise AuthError(400, "아이디는 2~20자의 한글/영문/숫자/밑줄만 가능해요.")
    if len(password or "") < 8:
        raise AuthError(400, "비밀번호는 8자 이상이어야 해요.")

    with get_session() as db:
        if db.exec(select(User).where(User.email == email)).first():
            raise AuthError(409, "이미 가입된 이메일이에요.")
        if db.exec(select(User).where(User.username == username)).first():
            raise AuthError(409, "이미 사용 중인 아이디예요.")

        user = User(
            email=email,
            username=username,
            password_hash=hash_password(password),
            points_balance=0,
            created_at=_now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # Starter grant, atomically recorded in the ledger.
        points_mod.apply(db, user, points_mod.SIGNUP_GRANT, "signup_grant")
        db.commit()
        db.refresh(user)
        return {"token": make_token(user.id), "user": user_view(user)}


def login(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    with get_session() as db:
        user = db.exec(select(User).where(User.email == email)).first()
        if user is None or not verify_password(password or "", user.password_hash):
            raise AuthError(401, "이메일 또는 비밀번호가 올바르지 않아요.")
        return {"token": make_token(user.id), "user": user_view(user)}


def get_user_by_id(user_id: int) -> Optional[User]:
    with get_session() as db:
        return db.get(User, user_id)


def current_user(authorization: Optional[str] = Header(default=None)) -> User:
    """FastAPI dependency: resolve the Bearer token to a User (401 otherwise)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthError(401, "로그인이 필요해요.")
    user = get_user_by_id(_decode(authorization[7:].strip()))
    if user is None:
        raise AuthError(401, "계정을 찾을 수 없어요.")
    return user


def optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[User]:
    """Like current_user but returns None instead of raising (for public+auth views)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    try:
        return get_user_by_id(_decode(authorization[7:].strip()))
    except HTTPException:
        return None
