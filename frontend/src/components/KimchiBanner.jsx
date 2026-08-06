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
  // blue-600 은 다크에서 어두운 파랑이라 캔버스에 묻힌다 — 800 이 양쪽 테마에서 읽힌다.
  const color = premium == null ? "text-slate-700" : isKimp ? "text-red-600" : "text-blue-800";
  const label = data?.label || (isKimp ? "김프" : "역프");

  // 참고 지표 띠는 면으로 칠하지 않고 괘선 한 줄로만 나눈다 — 세 개가 쌓이면
  // 색 면이 화면 위쪽을 다 먹는다(§1-3 · 단일 액센트).
  return (
    <div className="border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 t-caption">
        <span className="flex items-center font-semibold text-slate-700">
          김치프리미엄
          <InfoTooltip term="kimchi_premium" placement="bottom" />
        </span>

        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="field field-sm h-8 w-auto py-0 t-caption"
          aria-label="기준 종목"
        >
          {COINS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {loading && !data && <span className="text-slate-500">불러오는 중…</span>}

        {premium != null && (
          <span className={`t-label font-bold num ${color}`}>
            {isKimp ? "+" : ""}
            {premium.toFixed(2)}% <span className="t-caption">({label})</span>
          </span>
        )}

        {data?.ok && (
          <span className="text-slate-500 hidden sm:inline num">
            업비트 {krw(data.upbit_price_krw)} · 바이낸스환산 {krw(data.binance_price_krw)}
            <span> (${fmtPrice(data.binance_price_usdt)} × {fmtPrice(data.usdkrw)})</span>
          </span>
        )}

        {data?.fx_is_fallback && (
          <span className="font-semibold text-amber-700">환율 조회 실패, 근사값 사용</span>
        )}
        {error && <span className="font-semibold text-amber-700">{error}</span>}

        {data?.updated_at && (
          <span className="text-slate-500 ml-auto hidden md:inline">
            갱신 <span className="num">{data.updated_at.slice(11, 19)}</span> UTC · 참고용 지표(투자조언 아님)
          </span>
        )}
      </div>
    </div>
  );
}
