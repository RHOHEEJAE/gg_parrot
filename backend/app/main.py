"""FastAPI app: macro create/fetch, backtest, gallery, share card.

No exchange order APIs. Only the public Binance klines endpoint is used, for
historical data. Every returned result represents a PAST SIMULATION.
"""
from __future__ import annotations

import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sqlmodel import select

from . import chart as chart_mod
from . import chat as chat_mod
from . import hangang as hangang_mod
from . import hotcoins as hotcoins_mod
from . import kimchi as kimchi_mod
from . import leaderboard as leaderboard_mod
from . import optimize as optimize_mod
from . import paper as paper_mod
# [차후 도입] 고래 동향 — app/whales.py 는 그대로 두고 라우트만 꺼둡니다.
# from . import whales as whales_mod
from .card import render_card
from .security import hash_password
from .data import NoSpotDataError, average_daily_funding_pct, get_klines, resolve_period
from .marketdata import fetch_klines_for_macro
from .db import MacroRow, get_session, init_db
from .engine import BacktestResult, Macro, Period, human_summary
from .engine.backtest import run_backtest
from .engine.summary import _coin
from .realtrade import build_bundle

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Coin Macro Backtest & Share (Simulation only)", lifespan=lifespan)

# Ensure tables exist even when the app is imported without the lifespan running
# (e.g. TestClient constructed without a context manager).
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # dev: Vite on :5173; demo-scope only
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- helpers ------------------------------------------------------------
def _period_label(period: Period) -> str:
    labels = {"1y": "최근 1년", "6m": "최근 6개월", "3m": "최근 3개월"}
    if period.preset and period.preset != "custom":
        return labels.get(period.preset, period.preset)
    return f"{period.start} ~ {period.end}"


def _make_slug(macro: Macro) -> str:
    coin = _coin(macro.symbol).lower()
    p = macro.params
    descs = {
        "A": lambda: f"{p.get('take_profit_pct', 'x')}pct",
        "B": lambda: "band",
        "C": lambda: f"dca{p.get('interval_days', 'x')}d",
        "D": lambda: f"grid{p.get('grid_count', 'x')}",
        "E": lambda: f"trail{p.get('trail_percent', 'x')}",
        "F": lambda: f"rsi{p.get('rsi_period', 'x')}",
        "G": lambda: f"bb{p.get('bb_period', 'x')}",
        "H": lambda: f"safety{p.get('max_safety_orders', 'x')}",
        "I": lambda: f"vbk{p.get('k', 'x')}",
        "J": lambda: f"ma{p.get('fast_period', 'x')}x{p.get('slow_period', 'x')}",
    }
    desc = descs.get(macro.rule_type.value, lambda: macro.rule_type.value.lower())()
    side = macro.position_side.value
    return f"{coin}-{desc}-{side}-{uuid.uuid4().hex[:4]}"


def _run_for_macro(macro: Macro) -> tuple[BacktestResult, str, str]:
    start_ms, end_ms = resolve_period(macro.period.preset, macro.period.start, macro.period.end)
    # Picks spot vs USDT-M futures candles per the macro (short/leverage -> real
    # futures data). No synthetic fallback: a symbol with no real data raises
    # NoSpotDataError -> 422 at the endpoint.
    df, source = fetch_klines_for_macro(macro, start_ms, end_ms)
    result = run_backtest(macro, df)
    return result, source, _period_label(macro.period)


def _row_to_macro(row: MacroRow) -> Macro:
    return Macro.model_validate_json(row.macro_json)


# --- request/response models -------------------------------------------
class BacktestRequest(BaseModel):
    macro: Macro
    period_override: Optional[Period] = None


class PaperStartRequest(BaseModel):
    macro: Macro
    symbol: Optional[str] = None
    mode: str = "live"  # live | replay


class OptimizeRequest(BaseModel):
    macro: Macro
    tp_values: Optional[List[float]] = None
    sl_values: Optional[List[float]] = None


class BundleRequest(BaseModel):
    macro: Macro


class LeaderboardRegisterRequest(BaseModel):
    macro: Macro
    username: str  # display id (required)
    password: str  # edit-ownership proof (required; stored hashed only)
    user_id: str = "anon"
    mode: str = "live"  # live | replay


class LeaderboardEditRequest(BaseModel):
    macro: Macro
    password: str
    mode: str = "live"


class VoteRequest(BaseModel):
    user_id: str
    value: int  # +1 like | -1 dislike


class ChatPostRequest(BaseModel):
    username: str
    text: str


# --- endpoints ----------------------------------------------------------
@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "disclaimer": "past simulation only; no live trading"}


@app.post("/api/macros")
def create_macro(macro: Macro) -> dict:
    """Store a macro, generate share_slug, and snapshot a representative backtest."""
    macro.macro_id = str(uuid.uuid4())
    macro.created_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    summary = human_summary(macro)

    try:
        result, source, period_label = _run_for_macro(macro)
    except NoSpotDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:  # data/period problems shouldn't block saving
        raise HTTPException(status_code=400, detail=f"backtest failed: {exc}")

    with get_session() as session:
        # ensure unique slug
        for _ in range(5):
            slug = _make_slug(macro)
            if not session.exec(select(MacroRow).where(MacroRow.share_slug == slug)).first():
                break
        macro.share_slug = slug
        row = MacroRow(
            macro_id=macro.macro_id,
            share_slug=slug,
            symbol=macro.symbol,
            rule_type=macro.rule_type.value,
            position_side=macro.position_side.value,
            macro_json=macro.model_dump_json(),
            human_summary=summary,
            created_at=macro.created_at,
            rep_return_pct=result.final_return_pct,
            rep_win_pct=result.win_rate_pct,
            rep_mdd_pct=result.mdd_pct,
            rep_trades=result.total_trades,
            rep_source=source,
            rep_period_label=period_label,
            rep_leverage=macro.leverage,
        )
        session.add(row)
        session.commit()

    return {
        "macro": macro.model_dump(mode="json"),
        "share_slug": slug,
        "human_summary": summary,
        "result": result.model_dump(),
        "data_source": source,
    }


@app.get("/api/macros/{slug}")
def get_macro(slug: str) -> dict:
    with get_session() as session:
        row = session.exec(select(MacroRow).where(MacroRow.share_slug == slug)).first()
    if not row:
        raise HTTPException(status_code=404, detail="macro not found")
    macro = _row_to_macro(row)
    return {
        "macro": macro.model_dump(mode="json"),
        "share_slug": row.share_slug,
        "human_summary": row.human_summary,
    }


@app.post("/api/backtest")
def backtest(req: BacktestRequest) -> dict:
    macro = req.macro
    if req.period_override is not None:
        macro = macro.model_copy(update={"period": req.period_override})
    try:
        result, source, period_label = _run_for_macro(macro)
    except NoSpotDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "result": result.model_dump(),
        "human_summary": human_summary(macro),
        "data_source": source,
        "period_label": period_label,
        "disclaimer": "past simulation only; not real trading",
    }


@app.post("/api/optimize")
def optimize(req: OptimizeRequest) -> dict:
    """Sweep take-profit × stop-loss and return a scored grid (자동 최적화).

    Past-fit only: the response flags the overfitting risk and the UI must show
    it. Refuses symbols with no real spot data (422) rather than fabricating.
    """
    try:
        return optimize_mod.optimize_tp_sl(req.macro, req.tp_values, req.sl_values)
    except NoSpotDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/funding-rate")
def funding_rate(
    symbol: str,
    preset: str = "1y",
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> dict:
    """Average *daily* USDT-M funding cost (%) for a symbol over the period.

    Reference for prefilling the backtest funding fee with a realistic number.
    ``available`` is False (and the pct null) when the symbol has no perp market
    or the funding API is unreachable — the UI keeps the user's manual value.
    """
    try:
        start_ms, end_ms = resolve_period(preset, start, end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    avg = average_daily_funding_pct(symbol.upper(), start_ms, end_ms)
    return {
        "symbol": symbol.upper(),
        "avg_daily_funding_pct": avg,
        "available": avg is not None,
        "note": "3 settlements/day, mean absolute rate; reference only",
    }


@app.get("/api/kimchi-premium")
def kimchi_premium(symbol: str = "BTC") -> dict:
    """Aggregate upbit(KRW) vs binance(USDT)×USDKRW into the kimchi premium.

    Reference indicator only — never a trading signal. Degrades gracefully if
    the FX API is down (fallback rate flagged via ``fx_is_fallback``).
    """
    return kimchi_mod.get_premium(symbol)


@app.get("/api/usdkrw")
def usdkrw() -> dict:
    """Approximate USD->KRW rate for showing KRW alongside USDT amounts.

    Reference only — reuses the kimchi FX source (free API + fallback constant).
    Amounts in this app are denominated in USDT; the returned rate lets the UI
    render a rough KRW figure next to them for convenience.
    """
    return kimchi_mod.get_usdkrw()


@app.get("/api/hangang-temp")
def hangang_temp() -> dict:
    """'한강 수온' — proxy + server-cache the public Hangang temperature API.

    Fun reference widget (GGparrot tone). Server-cached so the upstream is hit at
    most once per window regardless of client count; degrades gracefully (stale
    cache or ok:false) so the page never breaks on an upstream failure.
    """
    return hangang_mod.get_temp()


@app.get("/api/candles")
def candles(
    symbol: str,
    interval: str = chart_mod.DEFAULT_INTERVAL,
    limit: int = 120,
    market: str = "spot",
) -> dict:
    """Recent OHLC candles for the live chart (public market data only).

    Globally cached per (symbol, interval, limit, market) for a few seconds, so
    many viewers collapse into at most one upstream call per window. The last
    candle is the in-progress bar (``closed: false``) and is never persisted to
    the shared kline cache, so it can't leak into a backtest.
    """
    try:
        return chart_mod.get_candles(symbol, interval=interval, limit=limit, market=market)
    except NoSpotDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/hot-coins")
def hot_coins(limit: int = 10) -> dict:
    """'오늘의 경주마' — surging + actively-traded USDT coins (Binance 24h).

    Globally cached: the exchange is hit at most once per cache window regardless
    of client count. Reference indicator only — never a trading signal.
    """
    return hotcoins_mod.get_hot_coins(limit)


# [차후 도입] '고래 동향' — 온체인 상위 지갑 매수/매도 흐름 (참고 지표).
# 상위 보유자 목록에 거래소·컨트랙트 지갑이 섞여 신호 신뢰도가 낮아 일단 보류.
# 주소 라벨링을 보강한 뒤 아래 라우트와 App.jsx 의 <WhaleBanner /> 를 함께 되살리면 됩니다.
# 로직/테스트는 app/whales.py, tests/test_whales.py 에 그대로 남아 있습니다.
#
# @app.get("/api/whale-activity")
# def whale_activity() -> dict:
#     """Server-cached per coin; degrades to stale/omitted so the page never breaks."""
#     return whales_mod.get_whale_activity()


@app.get("/api/gallery")
def gallery(limit: int = 50) -> dict:
    with get_session() as session:
        rows = session.exec(
            select(MacroRow).order_by(MacroRow.rep_return_pct.desc()).limit(limit)
        ).all()
    items = [
        {
            "share_slug": r.share_slug,
            "symbol": r.symbol,
            "rule_type": r.rule_type,
            "position_side": r.position_side,
            "human_summary": r.human_summary,
            "return_pct": r.rep_return_pct,
            "win_pct": r.rep_win_pct,
            "mdd_pct": r.rep_mdd_pct,
            "trades": r.rep_trades,
            "period_label": r.rep_period_label,
            "leverage": getattr(r, "rep_leverage", 1) or 1,
            "created_at": r.created_at,
        }
        for r in rows
    ]
    return {"items": items, "note": "all returns are backtest (simulated), not live"}


# --- 오늘의 리더보드 (daily KST paper-return board) ---------------------
# Simple in-memory rate limit for failed edit-password attempts: (entry_id, ip).
_edit_fails: dict[tuple[int, str], list[float]] = {}
_EDIT_MAX_FAILS = 5
_EDIT_WINDOW = 60.0


def _edit_rate_check(entry_id: int, ip: str) -> None:
    import time

    key = (entry_id, ip)
    now = time.time()
    hist = [t for t in _edit_fails.get(key, []) if now - t < _EDIT_WINDOW]
    if len(hist) >= _EDIT_MAX_FAILS:
        raise HTTPException(status_code=429, detail="비밀번호 시도가 너무 많습니다. 잠시 후 다시 시도하세요.")
    _edit_fails[key] = hist


def _edit_rate_fail(entry_id: int, ip: str) -> None:
    import time

    key = (entry_id, ip)
    _edit_fails.setdefault(key, []).append(time.time())


@app.post("/api/leaderboard/register")
async def leaderboard_register(req: LeaderboardRegisterRequest) -> dict:
    """Register a macro: start its paper session and add it to today's board.

    Requires a display id + password (password stored hashed, never returned).
    Rejects symbols with no spot data (422) so no fabricated entry is created.
    """
    if not req.username.strip() or not req.password:
        raise HTTPException(status_code=400, detail="아이디와 비밀번호를 모두 입력하세요.")
    macro = req.macro
    mode = "replay" if req.mode == "replay" else "live"
    try:
        info = await paper_mod.start_session(macro, macro.symbol, mode)
    except NoSpotDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    entry = leaderboard_mod.create_entry(
        user_id=req.user_id,
        username=req.username,
        password_hash=hash_password(req.password),
        symbol=macro.symbol,
        macro_json=macro.model_dump_json(),
        human_summary=human_summary(macro),
        paper_session_id=info["session_id"],
    )
    return {"entry": entry, "disclaimer": "paper (simulated) trading; reference only"}


@app.get("/api/leaderboard")
def leaderboard_list(user_id: str = "") -> dict:
    return leaderboard_mod.list_entries(viewer_id=user_id)


@app.post("/api/leaderboard/{entry_id}/vote")
def leaderboard_vote(entry_id: int, req: VoteRequest) -> dict:
    return leaderboard_mod.vote(entry_id, req.user_id, req.value)


@app.post("/api/leaderboard/{entry_id}/edit")
async def leaderboard_edit(entry_id: int, req: LeaderboardEditRequest, request: Request) -> dict:
    """Edit an entry's macro after verifying the password (server-side hash check).

    On success the old paper session is stopped and a new one starts with the
    updated macro. Failed attempts are rate-limited per (entry, client IP).
    """
    ip = request.client.host if request.client else "unknown"
    _edit_rate_check(entry_id, ip)
    if leaderboard_mod.get_entry(entry_id) is None:
        raise HTTPException(status_code=404, detail="엔트리를 찾을 수 없습니다.")
    if not leaderboard_mod.verify_owner(entry_id, req.password):
        _edit_rate_fail(entry_id, ip)
        raise HTTPException(status_code=403, detail="비밀번호가 일치하지 않습니다.")

    macro = req.macro
    mode = "replay" if req.mode == "replay" else "live"
    # Restart the paper session with the new macro (spot guard applies).
    old = leaderboard_mod.get_entry(entry_id)
    try:
        info = await paper_mod.start_session(macro, macro.symbol, mode)
    except NoSpotDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if old and old.paper_session_id:
        paper_mod.stop_session(old.paper_session_id)
    entry = leaderboard_mod.update_entry(
        entry_id,
        symbol=macro.symbol,
        macro_json=macro.model_dump_json(),
        human_summary=human_summary(macro),
        paper_session_id=info["session_id"],
    )
    return {"entry": entry}


# --- leaderboard chat (daily KST board) ---------------------------------
@app.get("/api/chat")
def chat_list() -> dict:
    return chat_mod.list_messages()


@app.post("/api/chat")
def chat_post(req: ChatPostRequest, request: Request) -> dict:
    ip = request.client.host if request.client else "unknown"
    try:
        msg = chat_mod.add_message(req.username, req.text, ip)
    except chat_mod.RateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"message": msg}


@app.get("/api/card/{slug}.png")
def card(slug: str) -> Response:
    with get_session() as session:
        row = session.exec(select(MacroRow).where(MacroRow.share_slug == slug)).first()
    if not row:
        raise HTTPException(status_code=404, detail="macro not found")
    frontend_base = os.environ.get("FRONTEND_BASE", "http://localhost:5173")
    png = render_card(
        symbol=row.symbol,
        human_summary=row.human_summary,
        period_label=row.rep_period_label,
        return_pct=row.rep_return_pct,
        win_pct=row.rep_win_pct,
        mdd_pct=row.rep_mdd_pct,
        trades=row.rep_trades,
        share_url=f"{frontend_base}/s/{slug}",
        data_source=row.rep_source,
        leverage=getattr(row, "rep_leverage", 1) or 1,
    )
    return Response(content=png, media_type="image/png")


# --- paper (simulated) trading -----------------------------------------
@app.post("/api/paper/start")
async def paper_start(req: PaperStartRequest) -> dict:
    mode = "replay" if req.mode == "replay" else "live"
    try:
        info = await paper_mod.start_session(req.macro, req.symbol, mode)
    except NoSpotDataError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    info["disclaimer"] = "paper (simulated) trading; no real orders, no API keys"
    return info


@app.post("/api/paper/{session_id}/stop")
def paper_stop(session_id: int) -> dict:
    return paper_mod.stop_session(session_id)


@app.get("/api/paper/{session_id}")
def paper_status(session_id: int) -> dict:
    status = paper_mod.get_status(session_id)
    if status is None:
        raise HTTPException(status_code=404, detail="paper session not found")
    status["disclaimer"] = "paper (simulated) trading; no real orders"
    return status


@app.get("/api/paper/{session_id}/trades")
def paper_trades(session_id: int) -> dict:
    return {"trades": paper_mod.get_trades(session_id)}


# --- real-trade executable bundle (real orders; default testnet/fake funds) -----------
@app.post("/api/realtrade/bundle")
def realtrade_bundle(req: BundleRequest) -> Response:
    data = build_bundle(req.macro)
    filename = f"realtrade-bot-{req.macro.rule_type.value}-{req.macro.position_side.value}.zip"
    return Response(
        content=data,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# --- serve built frontend if present (production single-process) --------
# Dev flow is Vite (:5173) + uvicorn (:8000). If the SPA has been built,
# also serve it here with an index.html fallback so deep links (/s/:slug,
# /gallery) work on refresh.
_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.isdir(_DIST):
    from fastapi.responses import FileResponse
    from fastapi import Request

    _ASSETS = os.path.join(_DIST, "assets")
    if os.path.isdir(_ASSETS):
        app.mount("/assets", StaticFiles(directory=_ASSETS), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str, request: Request):
        candidate = os.path.join(_DIST, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_DIST, "index.html"))
