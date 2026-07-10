import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { fmtPrice } from "../lib/format.js";
import InfoTooltip from "./InfoTooltip.jsx";

// Polling interval (ms). Configurable via env; default 15s (spec: 10~30s).
const POLL_MS = Number(import.meta.env?.VITE_KIMCHI_POLL_MS) || 15000;
const COINS = ["BTC", "ETH", "XRP", "SOL"];

const krw = (v) => (v == null ? "-" : `${fmtPrice(v)} 원`);

export default function KimchiBanner() {
  const [symbol, setSymbol] = useState("BTC");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const d = await api.kimchiPremium(symbol);
        if (alive) {
          setData(d);
          setError(d.ok ? "" : `시세 조회 실패 (${d.error || "unknown"})`);
        }
      } catch (e) {
        if (alive) setError(String(e.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    setLoading(true);
    tick();
    timer.current = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer.current);
    };
  }, [symbol]);

  const premium = data?.premium_pct;
  const isKimp = premium != null && premium >= 0;
  const color = premium == null ? "text-slate-700" : isKimp ? "text-red-600" : "text-blue-600";
  const label = data?.label || (isKimp ? "김프" : "역프");

  return (
    <div className="border-b border-slate-200 bg-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="flex items-center font-semibold text-slate-700">
           🌶️김치프리미엄
          <InfoTooltip term="kimchi_premium" placement="bottom" />
        </span>

        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="rounded-md bg-slate-100 border border-slate-300 px-2 py-0.5 text-xs text-slate-800"
          aria-label="기준 종목"
        >
          {COINS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {loading && !data && <span className="text-slate-500">불러오는 중…</span>}

        {premium != null && (
          <span className={`font-bold tabular-nums ${color}`}>
            {isKimp ? "+" : ""}
            {premium.toFixed(2)}% <span className="text-xs font-medium">({label})</span>
          </span>
        )}

        {data?.ok && (
          <span className="text-slate-500 text-xs hidden sm:inline">
            업비트 {krw(data.upbit_price_krw)} · 바이낸스환산 {krw(data.binance_price_krw)}
            <span className="text-slate-500"> (${fmtPrice(data.binance_price_usdt)} × {fmtPrice(data.usdkrw)})</span>
          </span>
        )}

        {data?.fx_is_fallback && (
          <span className="text-amber-600 text-xs">환율 조회 실패, 근사값 사용</span>
        )}
        {error && <span className="text-amber-600 text-xs">{error}</span>}

        {data?.updated_at && (
          <span className="text-slate-500 text-xs ml-auto hidden md:inline">
            갱신 {data.updated_at.slice(11, 19)} UTC · 참고용 지표(투자조언 아님)
          </span>
        )}
      </div>
    </div>
  );
}
