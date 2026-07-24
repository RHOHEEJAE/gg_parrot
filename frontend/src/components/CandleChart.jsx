import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import { fmtPrice, quoteOf } from "../lib/format.js";

// Dependency-free SVG candlestick chart (same approach as EquityChart).
//
// One polling loop is enough: Binance returns the still-forming bar with live
// high/low/close, so refetching on the cadence the server advertises (3s for 1m
// bars) both settles closed bars and animates the open one. The server cache
// collapses concurrent viewers into one upstream call per window.
//
// Zoom/pan model: we always hold up to BUFFER bars and render a window of
// `zoom` bars ending at `anchor`. `anchor === null` means "pinned to the live
// edge" — new bars keep scrolling in. Panning back sets an explicit anchor so
// incoming data can't yank the view away while the user is inspecting.
const BUFFER = 300; // bars fetched (server clamps at CHART_MAX_LIMIT)
const MIN_ZOOM = 10; // fewest bars on screen (max detail)
const DEFAULT_ZOOM = 80;

const INTERVALS = [
  { value: "1m", label: "1분" },
  { value: "5m", label: "5분" },
  { value: "15m", label: "15분" },
  { value: "1h", label: "1시간" },
  { value: "4h", label: "4시간" },
  { value: "1d", label: "1일" },
];

const UP = "#16a34a";
const DOWN = "#dc2626";

const pad2 = (n) => String(n).padStart(2, "0");

function hhmm(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fullTime(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// --- inspector panel: OHLC of the hovered (or latest) bar ---------------
function BarReadout({ bar, quote }) {
  if (!bar) return null;
  const rise = bar.c >= bar.o;
  const pct = bar.o ? ((bar.c - bar.o) / bar.o) * 100 : 0;
  const cell = (label, v) => (
    <span className="whitespace-nowrap">
      <span className="text-slate-400">{label}</span>{" "}
      <span className="tabular-nums text-slate-700">{fmtPrice(v)}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="font-semibold text-slate-600">{fullTime(bar.t)}</span>
      {cell("시", bar.o)}
      {cell("고", bar.h)}
      {cell("저", bar.l)}
      {cell("종", bar.c)}
      <span className={"font-bold tabular-nums " + (rise ? "text-green-600" : "text-red-600")}>
        {rise ? "+" : ""}
        {pct.toFixed(2)}%
      </span>
      {!bar.closed && (
        <span className="rounded bg-indigo-100 text-indigo-700 border border-indigo-300 px-1.5 py-0.5 font-semibold">
          진행 중
        </span>
      )}
      <span className="text-slate-400">{quote}</span>
    </div>
  );
}

function Chart({ candles, symbol, hover, setHover, onPan }) {
  const W = 720;
  const H = 260;
  const pad = { l: 6, r: 62, t: 10, b: 18 };
  const n = candles.length;
  const svgRef = useRef(null);
  const drag = useRef(null);

  const hi = Math.max(...candles.map((k) => k.h));
  const lo = Math.min(...candles.map((k) => k.l));
  const span = hi - lo || hi * 0.001 || 1;
  const top = hi + span * 0.08; // breathing room so wicks never touch the frame
  const bot = lo - span * 0.08;
  const range = top - bot || 1;

  const plotW = W - pad.l - pad.r;
  const slot = plotW / n;
  const bw = Math.max(1, Math.min(slot * 0.68, 22));
  const cx = (i) => pad.l + slot * (i + 0.5);
  const y = (v) => pad.t + (1 - (v - bot) / range) * (H - pad.t - pad.b);

  const last = candles[n - 1];
  const first = candles[0];
  const up = last.c >= first.o;
  const guides = [0, 1, 2, 3].map((i) => bot + (range * (i + 0.5)) / 4);

  // Map a pointer event to a bar index (viewBox coords, so scale by rect width).
  const indexAt = useCallback(
    (evt) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const vx = ((evt.clientX - rect.left) / rect.width) * W;
      const i = Math.floor((vx - pad.l) / slot);
      return i >= 0 && i < n ? i : null;
    },
    [n, slot]
  );

  function handleMove(e) {
    if (drag.current !== null) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        const perBar = rect.width / n;
        const moved = Math.round((drag.current.x - e.clientX) / perBar);
        if (moved !== 0) {
          onPan(moved);
          drag.current = { x: e.clientX };
        }
      }
      return;
    }
    setHover(indexAt(e));
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="w-full h-auto touch-none select-none cursor-crosshair"
      role="img"
      aria-label={`${symbol} 봉차트`}
      onMouseMove={handleMove}
      onMouseLeave={() => {
        setHover(null);
        drag.current = null;
      }}
      onMouseDown={(e) => {
        drag.current = { x: e.clientX };
        setHover(null);
      }}
      onMouseUp={() => (drag.current = null)}
    >
      {guides.map((v, i) => (
        <g key={i}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="#e2e8f0" strokeWidth="1" />
          <text x={W - pad.r + 5} y={y(v) + 3.5} fontSize="9" fill="#94a3b8">
            {fmtPrice(v)}
          </text>
        </g>
      ))}

      {candles.map((k, i) => {
        const rise = k.c >= k.o;
        const color = rise ? UP : DOWN;
        const bodyTop = Math.min(y(k.o), y(k.c));
        // A doji (open == close) would be a zero-height rect -> force 1px.
        const bodyH = Math.max(1, Math.abs(y(k.c) - y(k.o)));
        return (
          <g key={k.t} opacity={k.closed ? 1 : 0.8}>
            <line x1={cx(i)} x2={cx(i)} y1={y(k.h)} y2={y(k.l)} stroke={color} strokeWidth={bw > 6 ? 1.5 : 1} />
            <rect x={cx(i) - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} />
            {/* Zoomed in far enough that each bar can show its own open/close ticks */}
            {bw >= 12 && (
              <>
                <line x1={cx(i) - bw / 2 - 3} x2={cx(i) - bw / 2} y1={y(k.o)} y2={y(k.o)} stroke={color} strokeWidth="1.5" />
                <line x1={cx(i) + bw / 2} x2={cx(i) + bw / 2 + 3} y1={y(k.c)} y2={y(k.c)} stroke={color} strokeWidth="1.5" />
              </>
            )}
          </g>
        );
      })}

      {/* crosshair on the inspected bar */}
      {hover != null && candles[hover] && (
        <g pointerEvents="none">
          <line x1={cx(hover)} x2={cx(hover)} y1={pad.t} y2={H - pad.b} stroke="#64748b" strokeWidth="1" strokeDasharray="2 3" opacity="0.8" />
          <line x1={pad.l} x2={W - pad.r} y1={y(candles[hover].c)} y2={y(candles[hover].c)} stroke="#64748b" strokeWidth="1" strokeDasharray="2 3" opacity="0.55" />
          <rect x={W - pad.r + 1} y={y(candles[hover].c) - 8} width={pad.r - 3} height={16} rx="3" fill="#475569" />
          <text x={W - pad.r + 5} y={y(candles[hover].c) + 3.5} fontSize="9" fill="#fff" fontWeight="600">
            {fmtPrice(candles[hover].c)}
          </text>
        </g>
      )}

      {/* current price line + tag */}
      <line x1={pad.l} x2={W - pad.r} y1={y(last.c)} y2={y(last.c)} stroke={up ? UP : DOWN} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
      <rect x={W - pad.r + 1} y={y(last.c) - 8} width={pad.r - 3} height={16} rx="3" fill={up ? UP : DOWN} />
      <text x={W - pad.r + 5} y={y(last.c) + 3.5} fontSize="9" fill="#fff" fontWeight="600">
        {fmtPrice(last.c)}
      </text>

      <text x={pad.l} y={H - 5} fontSize="9" fill="#94a3b8">{hhmm(first.t)}</text>
      <text x={W - pad.r} y={H - 5} fontSize="9" fill="#94a3b8" textAnchor="end">{hhmm(last.t)}</text>
    </svg>
  );
}

export default function CandleChart({ symbol, defaultInterval = "1m" }) {
  const [interval, setInterval_] = useState(defaultInterval);
  const [candles, setCandles] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM); // bars visible
  const [anchor, setAnchor] = useState(null); // null = pinned to live edge
  const [hover, setHover] = useState(null);
  const timer = useRef(null);

  // --- polling loop ---
  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    let refreshMs = 3000;

    async function load(showSpinner) {
      if (showSpinner) setLoading(true);
      try {
        const d = await api.candles(symbol, interval, BUFFER);
        if (!alive) return;
        setCandles(d.candles || []);
        setError("");
        if (d.refresh_seconds) refreshMs = Math.max(2000, d.refresh_seconds * 1000);
      } catch (e) {
        if (alive) setError(String(e.message || e));
      } finally {
        if (alive && showSpinner) setLoading(false);
      }
    }

    setCandles(null);
    setAnchor(null); // a new symbol/interval always starts at the live edge
    setHover(null);
    load(true);
    const arm = () => {
      timer.current = window.setTimeout(async () => {
        await load(false);
        if (alive) arm();
      }, refreshMs);
    };
    arm();

    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [symbol, interval]);

  const total = candles?.length || 0;
  const maxZoom = Math.max(MIN_ZOOM, total);
  const view = useMemo(() => {
    if (!total) return [];
    const z = Math.min(zoom, total);
    const end = anchor == null ? total : Math.max(z, Math.min(anchor, total));
    return candles.slice(end - z, end);
  }, [candles, total, zoom, anchor]);

  const live = anchor == null; // following the newest bar

  const applyZoom = useCallback(
    (next) => {
      const z = Math.max(MIN_ZOOM, Math.min(Math.round(next), maxZoom));
      setZoom(z);
      setHover(null);
      // Keep the right edge where it is; clamp so the window stays in range.
      setAnchor((a) => (a == null ? null : Math.max(z, Math.min(a, total))));
    },
    [maxZoom, total]
  );

  const pan = useCallback(
    (bars) => {
      setHover(null);
      setAnchor((a) => {
        const cur = a == null ? total : a;
        const next = cur + bars;
        if (next >= total) return null; // snapped back to live
        return Math.max(Math.min(zoom, total), next);
      });
    },
    [total, zoom]
  );

  // Wheel zoom must be a NON-passive native listener: React registers onWheel
  // as passive, so preventDefault() there is ignored and the page scrolls too.
  // At the zoom limits we deliberately don't preventDefault, letting the page
  // scroll on past instead of trapping the cursor over the chart.
  const plotRef = useRef(null);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const onWheel = (e) => {
      const zoomingIn = e.deltaY < 0;
      if ((zoomingIn && zoom <= MIN_ZOOM) || (!zoomingIn && zoom >= maxZoom)) return;
      e.preventDefault();
      applyZoom(zoom * (zoomingIn ? 0.85 : 1.18));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, maxZoom, applyZoom]);

  const quote = quoteOf(symbol);
  const last = view.length ? view[view.length - 1] : null;
  const firstBar = view.length ? view[0] : null;
  const changePct = last && firstBar?.o ? ((last.c - firstBar.o) / firstBar.o) * 100 : 0;
  const up = changePct >= 0;
  const inspected = hover != null && view[hover] ? view[hover] : last;

  const btn =
    "rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 px-2 py-1 text-sm leading-none";

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-baseline gap-2">
          <h3 className="font-semibold">📈 {symbol}</h3>
          {last && (
            <>
              <span className="text-lg font-bold tabular-nums">{fmtPrice(last.c)}</span>
              <span className="text-xs text-slate-500">{quote}</span>
              <span className={"text-sm font-semibold tabular-nums " + (up ? "text-green-600" : "text-red-600")}>
                {up ? "+" : ""}
                {changePct.toFixed(2)}%
              </span>
            </>
          )}
          {live && last && !last.closed && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-600">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => applyZoom(zoom * 1.35)} disabled={zoom >= maxZoom} className={btn} title="축소 (더 많은 봉)">
            −
          </button>
          <span className="text-xs text-slate-500 tabular-nums w-14 text-center">{Math.min(zoom, total)}봉</span>
          <button onClick={() => applyZoom(zoom * 0.7)} disabled={zoom <= MIN_ZOOM} className={btn} title="확대 (봉 자세히)">
            +
          </button>
          {!live && (
            <button onClick={() => setAnchor(null)} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-2 py-1 text-xs font-semibold text-white" title="최신 봉으로 이동">
              최신
            </button>
          )}
          <select
            value={interval}
            onChange={(e) => setInterval_(e.target.value)}
            className="rounded-lg bg-slate-100 border border-slate-300 px-2 py-1 text-sm"
          >
            {INTERVALS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* OHLC read-out: hovered bar, or the latest one when not hovering */}
      <div className="mb-2 min-h-[20px]">
        <BarReadout bar={inspected} quote={quote} />
      </div>

      {error && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-6 text-center text-sm text-amber-800">
          차트를 불러오지 못했습니다: {error}
        </div>
      )}

      {!error && !candles && (
        <div className="h-[200px] flex items-center justify-center text-sm text-slate-400">
          {loading ? "차트 불러오는 중…" : "—"}
        </div>
      )}

      {!error && view.length > 0 && (
        <div ref={plotRef}>
          <Chart candles={view} symbol={symbol} hover={hover} setHover={setHover} onPan={pan} />
        </div>
      )}

      {!error && view.length > 0 && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-1">
          <span>휠·＋/− 확대 · 드래그로 이동 · 봉 위에 올리면 시/고/저/종</span>
          <span>
            {live ? "마지막 봉은 진행 중 (실시간 갱신)" : "과거 구간 보는 중"} · 바이낸스 공개 시세
          </span>
        </div>
      )}
    </div>
  );
}
