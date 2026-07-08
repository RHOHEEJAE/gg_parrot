"""Leaderboard chat — a daily (KST) message board (reference only, not advice).

Same daily-reset model as the leaderboard: messages are filtered to the current
KST day, so the chat clears at KST 00:00 without a scheduler. Safety: message
length is capped, output is escaped by React on render (we store raw and never
emit HTML), and a small in-memory rate limit curbs flooding.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Deque
from collections import defaultdict, deque

from sqlmodel import select

from .db import ChatMessage, get_session
from .leaderboard import _kst_hhmm, today_start_ms

MAX_LEN = 300
MAX_LIST = 200
# rate limit: at most _RATE_MAX messages per _RATE_WINDOW seconds per client key.
_RATE_MAX = 5
_RATE_WINDOW = 10.0
_recent: dict[str, Deque[float]] = defaultdict(deque)


class RateLimited(Exception):
    """Raised when a client sends messages too quickly."""


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _check_rate(client_key: str) -> None:
    now = time.time()
    q = _recent[client_key]
    while q and now - q[0] > _RATE_WINDOW:
        q.popleft()
    if len(q) >= _RATE_MAX:
        raise RateLimited("메시지를 너무 빠르게 보냈어요. 잠시 후 다시 시도하세요.")
    q.append(now)


def add_message(username: str, text: str, client_key: str) -> dict:
    text = (text or "").strip()
    if not text:
        raise ValueError("빈 메시지는 보낼 수 없습니다.")
    _check_rate(client_key)
    text = text[:MAX_LEN]  # length cap (stored raw; React escapes on render)
    name = (username or "익명").strip()[:24] or "익명"

    now = _now_utc()
    row = ChatMessage(
        username=name,
        text=text,
        created_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        created_ms=int(now.timestamp() * 1000),
    )
    with get_session() as db:
        db.add(row)
        db.commit()
        db.refresh(row)
    return _view(row)


def list_messages() -> dict:
    start_ms = today_start_ms()
    with get_session() as db:
        rows = db.exec(
            select(ChatMessage)
            .where(ChatMessage.created_ms >= start_ms)
            .order_by(ChatMessage.id.desc())
            .limit(MAX_LIST)
        ).all()
    # oldest-first for natural chat rendering
    items = [_view(r) for r in reversed(rows)]
    return {
        "items": items,
        "disclaimer": "채팅 내용은 투자 조언이 아니며, 매매 판단과 책임은 본인에게 있습니다.",
    }


def _view(row: ChatMessage) -> dict:
    return {
        "id": row.id,
        "username": row.username,
        "text": row.text,
        "created_kst": _kst_hhmm(row.created_ms),
        "created_at": row.created_at,
    }
