"""Parameter sweep (자동 최적화) over take-profit × stop-loss.

Runs the deterministic backtest across a grid of (take_profit_pct, stop_loss_pct)
combinations on the SAME fetched candles (fetched once, then reused for every
cell), so a user can see which region of the parameter space would have performed
best. Only these two universal knobs are swept — the macro supplies everything
else. Results are past-fit only; the endpoint/UI must flag the overfitting risk.
"""
from __future__ import annotations

from typing import List, Optional

from .data import get_klines, resolve_period
from .engine import Macro, run_backtest

# Bound each axis so one request can't explode into thousands of backtests.
MAX_AXIS = 12
DEFAULT_TP: List[float] = [2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0]
DEFAULT_SL: List[float] = [2.0, 3.0, 4.0, 5.0, 6.0, 8.0]

# Only rule types that carry a take_profit_pct in params can be swept this way.
_TP_PARAM = "take_profit_pct"

UNSUPPORTED_MSG = "이 규칙 타입은 익절/손절 자동 최적화를 지원하지 않습니다 (규칙 A에서 사용하세요)."


def _clean_axis(values: Optional[List[float]], fallback: List[float]) -> List[float]:
    """Sanitize a user-supplied axis: positive, de-duped, sorted, capped."""
    if not values:
        return list(fallback)
    cleaned = sorted({round(float(v), 4) for v in values if float(v) > 0})
    return cleaned[:MAX_AXIS] or list(fallback)


def optimize_tp_sl(
    macro: Macro,
    tp_values: Optional[List[float]] = None,
    sl_values: Optional[List[float]] = None,
) -> dict:
    """Sweep take-profit × stop-loss for ``macro`` and return a scored grid.

    Raises ``ValueError`` when the rule type has no ``take_profit_pct`` to sweep.
    Propagates ``NoSpotDataError`` from the data layer (no synthetic fallback).
    """
    if _TP_PARAM not in macro.params:
        raise ValueError(UNSUPPORTED_MSG)

    tps = _clean_axis(tp_values, DEFAULT_TP)
    sls = _clean_axis(sl_values, DEFAULT_SL)

    start_ms, end_ms = resolve_period(macro.period.preset, macro.period.start, macro.period.end)
    df, source = get_klines(
        macro.symbol, start_ms, end_ms, interval=macro.candle_interval, allow_synthetic=False
    )

    cells: List[dict] = []
    best: Optional[dict] = None
    for sl in sls:
        for tp in tps:
            m = macro.model_copy(
                update={
                    "params": {**macro.params, _TP_PARAM: tp},
                    "risk": macro.risk.model_copy(update={"stop_loss_pct": sl}),
                }
            )
            r = run_backtest(m, df)
            cell = {
                "tp": tp,
                "sl": sl,
                "final_return_pct": r.final_return_pct,
                "mdd_pct": r.mdd_pct,
                "sharpe": r.sharpe,
                "total_trades": r.total_trades,
            }
            cells.append(cell)
            if best is None or cell["final_return_pct"] > best["final_return_pct"]:
                best = cell

    cur_sl = macro.risk.stop_loss_pct
    return {
        "tp_values": tps,
        "sl_values": sls,
        "cells": cells,
        "best": best,
        "current": {
            "tp": round(float(macro.params[_TP_PARAM]), 4),
            "sl": round(float(cur_sl), 4) if cur_sl is not None else None,
        },
        "data_source": source,
        "disclaimer": "past-fit only; high risk of overfitting",
    }
