"""SQLite persistence for macros (SQLModel)."""
from __future__ import annotations

import os
from typing import Optional

from sqlmodel import Field, Session, SQLModel, create_engine

_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app.db")
_engine = create_engine(f"sqlite:///{_DB_PATH}", echo=False)


class MacroRow(SQLModel, table=True):
    """One shared macro plus a representative backtest snapshot for the gallery."""

    id: Optional[int] = Field(default=None, primary_key=True)
    macro_id: str = Field(index=True, unique=True)
    share_slug: str = Field(index=True, unique=True)
    symbol: str
    rule_type: str
    position_side: str
    macro_json: str  # full normalized macro JSON
    human_summary: str
    created_at: str

    # Representative backtest snapshot (over the macro's own period) for gallery/card.
    rep_return_pct: float = 0.0
    rep_win_pct: float = 0.0
    rep_mdd_pct: float = 0.0
    rep_trades: int = 0
    rep_source: str = ""
    rep_period_label: str = ""


class PaperSession(SQLModel, table=True):
    """A live/replay paper-trading session (simulated fills, no real orders)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    macro_id: str = Field(index=True)
    symbol: str
    mode: str = "live"  # live | replay
    status: str = "running"  # running | stopped
    started_at: str
    stopped_at: Optional[str] = None
    virtual_balance: float = 0.0  # initial capital
    current_equity: float = 0.0
    current_return: float = 0.0
    macro_json: str = ""


class LeaderboardEntry(SQLModel, table=True):
    """One user's macro entered into the daily (KST) paper-return leaderboard."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)  # anonymous localStorage id (voting/identity)
    nickname: str
    username: str = ""  # display id chosen at register time (v7)
    password_hash: str = ""  # PBKDF2 hash for edit ownership; never returned (v7)
    symbol: str
    macro_json: str
    human_summary: str
    paper_session_id: Optional[int] = None
    created_at: str  # UTC ISO
    created_ms: int = Field(index=True)  # epoch ms, for the KST day-window filter


class ChatMessage(SQLModel, table=True):
    """One leaderboard chat message (daily KST board; reference only)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str
    text: str
    created_at: str  # UTC ISO
    created_ms: int = Field(index=True)  # epoch ms, for the KST day-window filter


class LeaderboardVote(SQLModel, table=True):
    """One user's like(+1)/dislike(-1) on a leaderboard entry (1 vote per user)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    entry_id: int = Field(index=True)
    user_id: str = Field(index=True)
    value: int  # +1 like | -1 dislike


class PaperTrade(SQLModel, table=True):
    """One simulated fill inside a paper session."""

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True)
    ts: str
    side: str  # buy | sell | short | cover
    price: float
    qty: float
    return_at_trade: float


def _migrate() -> None:
    """Add columns introduced after a table was first created (SQLite create_all
    does not ALTER existing tables). Idempotent and safe to run every startup."""
    added = {
        "leaderboardentry": {
            "username": "ALTER TABLE leaderboardentry ADD COLUMN username TEXT DEFAULT ''",
            "password_hash": "ALTER TABLE leaderboardentry ADD COLUMN password_hash TEXT DEFAULT ''",
        }
    }
    with _engine.connect() as conn:
        for table, cols in added.items():
            existing = {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}
            if not existing:
                continue  # table not created yet; create_all made it with all columns
            for col, ddl in cols.items():
                if col not in existing:
                    conn.exec_driver_sql(ddl)
        conn.commit()


def init_db() -> None:
    SQLModel.metadata.create_all(_engine)
    _migrate()


def get_session() -> Session:
    return Session(_engine)
