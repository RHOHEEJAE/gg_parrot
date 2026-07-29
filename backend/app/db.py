"""SQLite persistence for macros (SQLModel)."""
from __future__ import annotations

import os
from typing import Optional

from sqlmodel import Field, Session, SQLModel, create_engine

# Engine selection: DATABASE_URL (Supabase/Postgres) in prod, local SQLite otherwise.
# This lets us develop & test on SQLite and run durable Postgres in deployment
# without any code change — only the env var differs. Accounts, points and the
# point ledger MUST live on the durable store (Render's free disk is ephemeral).
_DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()


def _build_engine():
    if _DATABASE_URL:
        url = _DATABASE_URL
        # Normalize to the psycopg (v3) driver SQLAlchemy expects.
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://"):]
        elif url.startswith("postgresql://"):
            url = "postgresql+psycopg://" + url[len("postgresql://"):]
        # pool_pre_ping recycles connections Supabase drops when idle.
        return create_engine(url, echo=False, pool_pre_ping=True)
    path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app.db")
    return create_engine(f"sqlite:///{path}", echo=False)


_engine = _build_engine()


def _is_sqlite() -> bool:
    return _engine.dialect.name == "sqlite"


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
    rep_leverage: int = 1  # macro leverage (for the gallery high-risk badge)


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
    # isolated-margin liquidation stats (leverage > 1); 0 for spot macros
    liquidations: int = 0
    liquidated_loss: float = 0.0
    macro_json: str = ""


class LeaderboardEntry(SQLModel, table=True):
    """One user's macro entered into the daily (KST) paper-return leaderboard."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(index=True)  # anonymous localStorage id (voting/identity)
    nickname: str
    username: str = ""  # display id chosen at register time (v7)
    password_hash: str = ""  # PBKDF2 hash for edit ownership; never returned (v7)
    # Marketplace: the registered account that owns this entry and receives the
    # creator share when others unlock it. None for legacy anonymous entries.
    owner_user_id: Optional[int] = Field(default=None, index=True)
    symbol: str
    macro_json: str
    human_summary: str
    paper_session_id: Optional[int] = None
    created_at: str  # UTC ISO
    created_ms: int = Field(index=True)  # epoch ms, for the KST day-window filter


class User(SQLModel, table=True):
    """A registered account. Identity + virtual points wallet.

    Auth is our own (email + PBKDF2 hash + JWT session); Supabase is used purely
    as the Postgres store. ``points_balance`` is the authoritative wallet; every
    change is also appended to :class:`PointLedger` for an auditable history.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    username: str = Field(index=True, unique=True)  # public display id
    password_hash: str  # PBKDF2 (see security.py); never returned
    points_balance: int = Field(default=0)  # virtual points (no cash yet)
    created_at: str


class PointLedger(SQLModel, table=True):
    """Append-only record of every points change (audit trail for the wallet)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    delta: int  # +credit / -debit
    balance_after: int
    reason: str  # signup_grant | unlock_spend | unlock_earn | topup(future)
    ref: str = ""  # e.g. "entry:123"
    created_at: str
    created_ms: int = Field(index=True)


class MacroUnlock(SQLModel, table=True):
    """Records that a user paid points to reveal/copy a leaderboard entry's macro."""

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)  # who unlocked
    entry_id: int = Field(index=True)  # which leaderboard entry
    price: int  # points paid
    created_at: str


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


class WhaleHolderBalance(SQLModel, table=True):
    """Last observed on-chain balance of one top-holder wallet ('고래 동향').

    Diffed against the next observation to classify a wallet as buying/selling.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    coin: str = Field(index=True)  # PEPE | WETH | XRP
    wallet: str = Field(index=True)
    balance_raw: str
    updated_at: str


class WhaleObservation(SQLModel, table=True):
    """Latest whale-flow summary per coin (also marks when we last observed)."""

    coin: str = Field(primary_key=True)
    observed_at: str
    buys: int = 0
    sells: int = 0
    tracked: int = 0


def _migrate() -> None:
    """Add columns introduced after a table was first created (SQLite create_all
    does not ALTER existing tables). Idempotent and safe to run every startup."""
    added = {
        "leaderboardentry": {
            "username": "ALTER TABLE leaderboardentry ADD COLUMN username TEXT DEFAULT ''",
            "password_hash": "ALTER TABLE leaderboardentry ADD COLUMN password_hash TEXT DEFAULT ''",
            "owner_user_id": "ALTER TABLE leaderboardentry ADD COLUMN owner_user_id INTEGER",
        },
        "papersession": {
            "liquidations": "ALTER TABLE papersession ADD COLUMN liquidations INTEGER DEFAULT 0",
            "liquidated_loss": "ALTER TABLE papersession ADD COLUMN liquidated_loss FLOAT DEFAULT 0",
        },
        "macrorow": {
            "rep_leverage": "ALTER TABLE macrorow ADD COLUMN rep_leverage INTEGER DEFAULT 1",
        },
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
    # _migrate uses SQLite PRAGMA and only patches pre-existing SQLite tables.
    # On a fresh Postgres, create_all already builds every table with all columns.
    if _is_sqlite():
        _migrate()


def get_session() -> Session:
    return Session(_engine)
