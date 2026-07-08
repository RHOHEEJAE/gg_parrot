"""Daily (KST) paper-return leaderboard.

Users register a macro; it starts a paper session (reusing the paper engine) and
appears on a board sorted by likes. The board is a *today-only* view: entries are
filtered to the current KST calendar day, so at KST 00:00 the board naturally
resets without any scheduler (spec §3.4, "조회 시 오늘 것만 필터").

KST is a fixed +09:00 offset (no DST), so we use ``timezone(timedelta(hours=9))``
instead of ``zoneinfo`` to avoid a tz-database dependency on Windows.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlmodel import select

from . import paper as paper_mod
from .db import LeaderboardEntry, LeaderboardVote, get_session
from .security import verify_password

KST = timezone(timedelta(hours=9))


# --- KST time helpers ---------------------------------------------------
def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _kst_midnight_bounds() -> tuple[datetime, datetime]:
    """(today 00:00 KST, tomorrow 00:00 KST) as aware datetimes."""
    now_kst = _now_utc().astimezone(KST)
    start = now_kst.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def today_start_ms() -> int:
    start, _ = _kst_midnight_bounds()
    return int(start.timestamp() * 1000)


def seconds_to_reset() -> int:
    _, nxt = _kst_midnight_bounds()
    return max(0, int((nxt - _now_utc().astimezone(KST)).total_seconds()))


def _kst_hhmm(created_ms: int) -> str:
    return datetime.fromtimestamp(created_ms / 1000, KST).strftime("%H:%M")


# --- entries ------------------------------------------------------------
def create_entry(
    *,
    user_id: str,
    username: str,
    password_hash: str,
    symbol: str,
    macro_json: str,
    human_summary: str,
    paper_session_id: Optional[int],
) -> dict:
    now = _now_utc()
    created_ms = int(now.timestamp() * 1000)
    name = (username or "익명").strip()[:24] or "익명"
    row = LeaderboardEntry(
        user_id=user_id or "anon",
        nickname=name,
        username=name,
        password_hash=password_hash,
        symbol=symbol,
        macro_json=macro_json,
        human_summary=human_summary,
        paper_session_id=paper_session_id,
        created_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        created_ms=created_ms,
    )
    with get_session() as db:
        db.add(row)
        db.commit()
        db.refresh(row)
    return _entry_view(row, {}, viewer_id=user_id)


def get_entry(entry_id: int) -> Optional[LeaderboardEntry]:
    with get_session() as db:
        return db.get(LeaderboardEntry, entry_id)


def verify_owner(entry_id: int, password: str) -> bool:
    """True if ``password`` matches the entry's stored hash (server-side check)."""
    row = get_entry(entry_id)
    if row is None or not row.password_hash:
        return False
    return verify_password(password, row.password_hash)


def update_entry(
    entry_id: int,
    *,
    symbol: str,
    macro_json: str,
    human_summary: str,
    paper_session_id: Optional[int],
) -> Optional[dict]:
    """Replace an entry's macro/session (caller must verify ownership first)."""
    with get_session() as db:
        row = db.get(LeaderboardEntry, entry_id)
        if row is None:
            return None
        row.symbol = symbol
        row.macro_json = macro_json
        row.human_summary = human_summary
        row.paper_session_id = paper_session_id
        db.add(row)
        db.commit()
        db.refresh(row)
        viewer = row.user_id
    return _entry_view(row, {}, viewer_id=viewer)


def _vote_tallies(db, entry_ids: list[int]) -> dict[int, dict]:
    """entry_id -> {likes, dislikes, votes_by_user: {user_id: value}}."""
    tallies: dict[int, dict] = {eid: {"likes": 0, "dislikes": 0, "by_user": {}} for eid in entry_ids}
    if not entry_ids:
        return tallies
    votes = db.exec(select(LeaderboardVote).where(LeaderboardVote.entry_id.in_(entry_ids))).all()
    for v in votes:
        t = tallies.get(v.entry_id)
        if not t:
            continue
        if v.value > 0:
            t["likes"] += 1
        elif v.value < 0:
            t["dislikes"] += 1
        t["by_user"][v.user_id] = v.value
    return tallies


def _live_return(session_id: Optional[int]) -> tuple[Optional[float], Optional[float], str]:
    """(return_pct, equity, status) from the paper session, if any."""
    if session_id is None:
        return None, None, "none"
    status = paper_mod.get_status(session_id)
    if not status:
        return None, None, "none"
    return status.get("current_return"), status.get("current_equity"), status.get("status", "unknown")


def _entry_view(row: LeaderboardEntry, tally: dict, *, viewer_id: str) -> dict:
    ret, equity, pstatus = _live_return(row.paper_session_id)
    likes = tally.get("likes", 0)
    dislikes = tally.get("dislikes", 0)
    my_vote = tally.get("by_user", {}).get(viewer_id, 0)
    try:
        macro = json.loads(row.macro_json)
    except (ValueError, TypeError):
        macro = None
    # NOTE: password_hash is intentionally never included in the view.
    return {
        "id": row.id,
        "username": row.username or row.nickname,
        "nickname": row.nickname,
        "symbol": row.symbol,
        "human_summary": row.human_summary,
        "macro": macro,  # for "매크로 복사하기 → 빌더" prefill
        "return_pct": ret,
        "equity": equity,
        "paper_status": pstatus,
        "paper_session_id": row.paper_session_id,
        "likes": likes,
        "dislikes": dislikes,
        "score": likes - dislikes,
        "my_vote": my_vote,
        "created_at": row.created_at,
        "created_kst": _kst_hhmm(row.created_ms),
        "is_mine": row.user_id == viewer_id,
    }


def list_entries(viewer_id: str = "") -> dict:
    """Today's (KST) entries, sorted by likes-score then live return."""
    start_ms = today_start_ms()
    with get_session() as db:
        rows = db.exec(
            select(LeaderboardEntry).where(LeaderboardEntry.created_ms >= start_ms)
        ).all()
        tallies = _vote_tallies(db, [r.id for r in rows])

    items = [_entry_view(r, tallies.get(r.id, {}), viewer_id=viewer_id) for r in rows]
    # v7: default sort is live RETURN desc; tie-break by earliest registration.
    # Stable two-pass: sort by created_at asc first, then by return desc so equal
    # returns keep the earlier entry on top; entries with no return yet sink last.
    items.sort(key=lambda e: e["created_at"])
    items.sort(
        key=lambda e: (e["return_pct"] is not None, e["return_pct"] if e["return_pct"] is not None else 0.0),
        reverse=True,
    )
    return {
        "items": items,
        "seconds_to_reset": seconds_to_reset(),
        "note": "수익률/좋아요는 참고용이며 투자 조언이 아닙니다. 매일 KST 00:00 초기화됩니다.",
    }


def vote(entry_id: int, user_id: str, value: int) -> dict:
    """Set/toggle a user's vote (+1/-1). Re-voting the same value cancels it."""
    value = 1 if value > 0 else -1
    with get_session() as db:
        existing = db.exec(
            select(LeaderboardVote).where(
                LeaderboardVote.entry_id == entry_id, LeaderboardVote.user_id == user_id
            )
        ).first()
        if existing is None:
            db.add(LeaderboardVote(entry_id=entry_id, user_id=user_id, value=value))
        elif existing.value == value:
            db.delete(existing)  # toggle off
        else:
            existing.value = value
            db.add(existing)
        db.commit()
        tally = _vote_tallies(db, [entry_id])[entry_id]
    return {
        "entry_id": entry_id,
        "likes": tally["likes"],
        "dislikes": tally["dislikes"],
        "my_vote": tally["by_user"].get(user_id, 0),
    }
