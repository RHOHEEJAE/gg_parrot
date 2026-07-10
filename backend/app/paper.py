"""Paper (simulated) trading manager.

Drives the SAME execution machine as the backtest (``engine.stepper``), but fed
by live ticks instead of historical candles. NO real orders, NO account, NO API
keys — only public price data is read. Every session is flagged simulated.

Assumptions / choices (see README):
  * Real-time source: REST polling of the public ticker (simplest, robust),
    interval from ``PAPER_POLL_SECONDS`` (default 3s).
  * ``demo_replay`` mode fast-forwards recent 1m candles so trades reliably
    stream during a talk even if the live market is flat / offline (synthetic
    intraday fallback when candles are unavailable).
  * Single-process assumption: running sessions live in memory + SQLite. Fine
    for a demo; a multi-worker deploy would need a shared store.
"""
from __future__ import annotations

import asyncio
import math
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlmodel import select

from .data import ensure_spot_available, get_klines, get_ticker_price_cached
from .db import PaperSession, PaperTrade, get_session
from .engine import Macro, RuleType
from .engine.stepper import make_sim

POLL_SECONDS = float(os.environ.get("PAPER_POLL_SECONDS", "3"))
REPLAY_SECONDS = float(os.environ.get("PAPER_REPLAY_SECONDS", "0.4"))
REPLAY_HOURS = int(os.environ.get("PAPER_REPLAY_HOURS", "6"))
_RECENT_CAP = 200


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _synthetic_intraday(symbol: str, n: int = 360) -> List[float]:
    """Deterministic intraday walk with ~1-2% swings (offline replay fallback)."""
    seed = sum(ord(ch) for ch in symbol.upper())
    base = 100.0 + (seed % 500)
    out: List[float] = []
    price = base
    for i in range(n):
        wave = math.sin((i + seed) / 7.0) * 0.010 + math.sin((i + seed) / 2.3) * 0.006
        price *= 1.0 + wave
        out.append(round(price, 4))
    return out


class _Runner:
    def __init__(self, session_id: int, sim, symbol: str, mode: str, initial: float):
        self.session_id = session_id
        self.sim = sim
        self.symbol = symbol
        self.mode = mode
        self.initial = initial
        self.stop_flag = False
        self.task: Optional[asyncio.Task] = None
        self.last_price = 0.0
        self.equity = initial
        self.ret = 0.0
        self.status = "running"
        self.recent: List[dict] = []
        self.replay_prices: List[float] = []
        self.liquidations = 0
        self.liquidated_loss = 0.0


_running: Dict[int, _Runner] = {}


def _session_initial(macro: Macro) -> float:
    if macro.rule_type is RuleType.C:
        return 1_000_000.0
    return float(macro.initial_capital or 1_000_000.0)


# --- lifecycle ----------------------------------------------------------
async def start_session(macro: Macro, symbol: Optional[str], mode: str) -> dict:
    symbol = (symbol or macro.symbol).upper()
    # Refuse futures-only / delisted symbols: no real spot data -> no paper
    # session (raises NoSpotDataError -> 422 at the endpoint). Never run on a
    # synthetic fallback here.
    await asyncio.to_thread(ensure_spot_available, symbol)
    initial = _session_initial(macro)
    sim = make_sim(macro, initial_capital=initial)

    with get_session() as db:
        row = PaperSession(
            macro_id=macro.macro_id or "adhoc",
            symbol=symbol,
            mode=mode,
            status="running",
            started_at=_now_iso(),
            virtual_balance=initial,
            current_equity=initial,
            current_return=0.0,
            macro_json=macro.model_dump_json(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        session_id = row.id

    runner = _Runner(session_id, sim, symbol, mode, initial)
    if mode == "replay":
        runner.replay_prices = await asyncio.to_thread(_load_replay_prices, symbol)

    _running[session_id] = runner
    runner.task = asyncio.create_task(_run_loop(runner))

    return {
        "session_id": session_id,
        "symbol": symbol,
        "mode": mode,
        "virtual_balance": initial,
        "status": "running",
    }


def _load_replay_prices(symbol: str) -> List[float]:
    end = _now_ms()
    start = end - REPLAY_HOURS * 3600 * 1000
    try:
        df, _ = get_klines(symbol, start, end, interval="1m")
        prices = [float(x) for x in df["close"].tolist()]
    except Exception:
        prices = []
    if len(prices) < 30:
        prices = _synthetic_intraday(symbol)
    return prices


async def _run_loop(runner: _Runner) -> None:
    try:
        if runner.mode == "replay":
            for price in runner.replay_prices:
                if runner.stop_flag:
                    break
                _tick(runner, price)
                await asyncio.sleep(REPLAY_SECONDS)
            _finalize(runner)  # replay exhausted -> auto stop
        else:
            while not runner.stop_flag:
                # Cached per-symbol: concurrent sessions on the same coin share one fetch.
                price = await asyncio.to_thread(get_ticker_price_cached, runner.symbol)
                if price is not None:
                    _tick(runner, price)
                await asyncio.sleep(POLL_SECONDS)
    except asyncio.CancelledError:
        pass


def _tick(runner: _Runner, price: float) -> None:
    runner.last_price = price
    fill = runner.sim.step(price)
    runner.equity = runner.sim.equity(price)
    runner.ret = (runner.equity - runner.initial) / runner.initial * 100.0
    runner.liquidations = getattr(runner.sim, "liquidations", 0)
    runner.liquidated_loss = getattr(runner.sim, "liquidated_loss", 0.0)

    with get_session() as db:
        row = db.get(PaperSession, runner.session_id)
        if row and row.status == "running":
            row.current_equity = round(runner.equity, 4)
            row.current_return = round(runner.ret, 4)
            row.liquidations = runner.liquidations
            row.liquidated_loss = round(runner.liquidated_loss, 4)
            db.add(row)
        if fill:
            trade = PaperTrade(
                session_id=runner.session_id,
                ts=_now_iso(),
                side=fill.side,
                price=round(fill.price, 4),
                qty=round(fill.qty, 8),
                return_at_trade=round(fill.return_pct, 4),
            )
            db.add(trade)
        db.commit()
        if fill:
            db.refresh(trade)
            runner.recent.insert(
                0,
                {
                    "id": trade.id,
                    "ts": trade.ts,
                    "side": trade.side,
                    "price": trade.price,
                    "qty": trade.qty,
                    "return_at_trade": trade.return_at_trade,
                },
            )
            del runner.recent[_RECENT_CAP:]


def _finalize(runner: _Runner) -> None:
    runner.status = "stopped"
    with get_session() as db:
        row = db.get(PaperSession, runner.session_id)
        if row:
            row.status = "stopped"
            row.stopped_at = _now_iso()
            row.current_equity = round(runner.equity, 4)
            row.current_return = round(runner.ret, 4)
            db.add(row)
            db.commit()


def stop_session(session_id: int) -> dict:
    runner = _running.get(session_id)
    if runner:
        runner.stop_flag = True
        if runner.task:
            runner.task.cancel()
        _finalize(runner)
        _running.pop(session_id, None)
        return {"session_id": session_id, "status": "stopped"}

    with get_session() as db:
        row = db.get(PaperSession, session_id)
        if not row:
            return {"error": "not found"}
        if row.status == "running":
            row.status = "stopped"
            row.stopped_at = _now_iso()
            db.add(row)
            db.commit()
    return {"session_id": session_id, "status": "stopped"}


def get_status(session_id: int) -> Optional[dict]:
    runner = _running.get(session_id)
    if runner:
        return {
            "session_id": session_id,
            "symbol": runner.symbol,
            "mode": runner.mode,
            "status": runner.status,
            "virtual_balance": round(runner.initial, 2),
            "current_equity": round(runner.equity, 2),
            "current_return": round(runner.ret, 4),
            "last_price": round(runner.last_price, 4),
            "liquidations": runner.liquidations,
            "liquidated_loss": round(runner.liquidated_loss, 2),
            "trades": runner.recent[:30],
        }

    with get_session() as db:
        row = db.get(PaperSession, session_id)
        if not row:
            return None
        trades = db.exec(
            select(PaperTrade)
            .where(PaperTrade.session_id == session_id)
            .order_by(PaperTrade.id.desc())
            .limit(30)
        ).all()
    return {
        "session_id": session_id,
        "symbol": row.symbol,
        "mode": row.mode,
        "status": row.status,
        "virtual_balance": round(row.virtual_balance, 2),
        "current_equity": round(row.current_equity, 2),
        "current_return": round(row.current_return, 4),
        "last_price": 0.0,
        "liquidations": getattr(row, "liquidations", 0) or 0,
        "liquidated_loss": round(getattr(row, "liquidated_loss", 0.0) or 0.0, 2),
        "trades": [
            {
                "id": t.id,
                "ts": t.ts,
                "side": t.side,
                "price": t.price,
                "qty": t.qty,
                "return_at_trade": t.return_at_trade,
            }
            for t in trades
        ],
    }


def get_trades(session_id: int) -> List[dict]:
    with get_session() as db:
        trades = db.exec(
            select(PaperTrade)
            .where(PaperTrade.session_id == session_id)
            .order_by(PaperTrade.id.desc())
        ).all()
    return [
        {
            "id": t.id,
            "ts": t.ts,
            "side": t.side,
            "price": t.price,
            "qty": t.qty,
            "return_at_trade": t.return_at_trade,
        }
        for t in trades
    ]
