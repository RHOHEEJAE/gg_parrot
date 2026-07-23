import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { fmtPrice, quoteOf } from "../lib/format.js";

// Dependency-free SVG candlestick chart (same approach as EquityChart).
//
// One polling loop is enough: Binance returns the still-forming bar with live
// high/low/close, so refetching on the cadence the server advertises (3s for 1m
// bars) both settles closed bars and animates the open one. The server cache
// collapses concurrent viewers into one upstream call per window.
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

function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function Chart({ candles, symbol }) {
  const W = 720;
  const H = 260;
  const pad = { l: 6, r: 62, t: 10, b: 18 };
  const n = candles.length;

  const hi = Math.max(...candles.map((k) => k.h));
  const lo = Math.min(...candles.map((k) => k.l));
  const span = hi - lo || hi * 0.001 || 1;
  // Breathing room so wicks never touch the frame.
  const top = hi + span * 0.08;
  const bot = lo - span * 0.08;
  const range = top - bot || 1;

  const plotW = W - pad.l - pad.r;
  const slot = plotW / n;
  const bw = Math.max(1, Math.min(slot * 0.68, 14)); // candle body width
  const cx = (i) => pad.l + slot * (i + 0.5);
  const y = (v) => pad.t + (1 - (v - bot) / range) * (H - pad.t - pad.b);

  const last = candles[n - 1];
  const first = candles[0];
  const up = last.c >= first.o;

  // 4 horizontal guides, labelled on the right.
  const guides = [0, 1, 2, 3].map((i) => bot + (range * (i + 0.5)) / 4);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${symbol} 봉차트`}>
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
        const yO = y(k.o);
        const yC = y(k.c);
        const bodyTop = Math.min(yO, yC);
        // Doji (open == close) would render as a zero-height rect -> force 1px.
        const bodyH = Math.max(1, Math.abs(yC - yO));
        return (
          <g key={k.t} opacity={k.closed ? 1 : 0.75}>
            <line x1={cx(i)} x2={cx(i)} y1={y(k.h)} y2={y(k.l)} stroke={color} strokeWidth="1" />
            <rect x={cx(i) - bw / 2} y={bodyTop} width={bw} height={bodyH} fill={color} />
          </g>
        );
      })}

      {/* current price line + tag */}
      <line
        x1={pad.l}
        x2={W - pad.r}
        y1={y(last.c)}
        y2={y(last.c)}
        stroke={up ? UP : DOWN}
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.7"
      />
      <rect x={W - pad.r + 1} y={y(last.c) - 8} width={pad.r - 3} height={16} rx="3" fill={up ? UP : DOWN} />
      <text x={W - pad.r + 5} y={y(last.c) + 3.5} fontSize="9" fill="#fff" fontWeight="600">
        {fmtPrice(last.c)}
      </text>

      <text x={pad.l} y={H - 5} fontSize="9" fill="#94a3b8">{hhmm(first.t)}</text>
      <text x={W - pad.r} y={H - 5} fontSize="9" fill="#94a3b8" textAnchor="end">{hhmm(last.t)}</text>
    </svg>
  );
}

export default function CandleChart({ symbol, defaultInterval = "1m", limit = 120 }) {
  const [interval, setInterval_] = useState(defaultInterval);
  const [candles, setCandles] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const candleTimer = useRef(null);

  // --- candle refetch loop (settles bars) ---
  useEffect(() => {
    if (!symbol) return;
    let alive = true;
    let refreshMs = 3000;

    async function load(showSpinner) {
      if (showSpinner) setLoading(true);
      try {
        const d = await api.candles(symbol, interval, limit);
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
    load(true);
    // Re-arm each cycle so the cadence follows whatever the server advertises.
    const arm = () => {
      candleTimer.current = window.setTimeout(async () => {
        await load(false);
        if (alive) arm();
      }, refreshMs);
    };
    arm();

    return () => {
      alive = false;
      clearTimeout(candleTimer.current);
    };
  }, [symbol, interval, limit]);

  const quote = quoteOf(symbol);
  const last = candles?.length ? candles[candles.length - 1] : null;
  const first = candles?.length ? candles[0] : null;
  const changePct = last && first && first.o ? ((last.c - first.o) / first.o) * 100 : 0;
  const up = changePct >= 0;

  return (
    <div className="rounded-2xl bg-white border border-slate-200 p-5">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
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
        </div>
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

      {!error && candles?.length > 0 && <Chart candles={candles} symbol={symbol} />}

      {!error && candles?.length > 0 && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span>마지막 봉은 아직 진행 중이라 연하게 표시돼요</span>
          <span>바이낸스 공개 시세 · 참고용</span>
        </div>
      )}
    </div>
  );
}
