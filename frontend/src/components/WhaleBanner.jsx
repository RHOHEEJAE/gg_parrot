import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import InfoTooltip from "./InfoTooltip.jsx";

// The server caches per coin (10 min for ERC-20, 6 h for the daily XRP rich
// list), so this is only how often the browser re-reads the shared value.
const POLL_MS = Number(import.meta.env?.VITE_WHALE_POLL_MS) || 300000;

function netCls(net) {
  if (net > 0) return "text-green-700";
  if (net < 0) return "text-red-700";
  return "text-slate-500";
}

function CoinChip({ c, onPick }) {
  // First-ever observation has no baseline to diff against yet.
  if (c.baseline) {
    return (
      <span className="text-xs text-slate-500">
        {c.name} <span className="text-slate-400">기준 수집 중…</span>
      </span>
    );
  }
  return (
    <button
      onClick={() => onPick(c.symbol)}
      title={`${c.name} 상위 ${c.tracked}개 지갑 기준 · 이 종목으로 매크로 만들기`}
      className="flex items-center gap-1.5 rounded-full border border-cyan-200 bg-white/70 px-2.5 py-0.5 hover:bg-white transition-colors"
    >
      <span className="font-semibold text-slate-700">{c.name}</span>
      <span className="text-green-600 tabular-nums">▲{c.buys}</span>
      <span className="text-red-600 tabular-nums">▼{c.sells}</span>
      <span className={"font-bold tabular-nums " + netCls(c.net)}>
        {c.net > 0 ? "+" : ""}
        {c.net}
      </span>
      {c.stale && <span className="text-[10px] text-amber-600">(이전값)</span>}
    </button>
  );
}

export default function WhaleBanner() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const d = await api.whaleActivity();
        if (alive) setData(d);
      } catch (_) {
        /* keep the last good value; the widget just hides if there was none */
      }
    }
    tick();
    timer.current = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer.current);
    };
  }, []);

  const coins = data?.coins || [];
  // Nothing usable (upstream down and no cache) -> hide entirely so the layout
  // is never broken, same as the other reference banners.
  if (!data?.ok || coins.length === 0) return null;

  // Lead with the coin that has the strongest one-sided flow.
  const lead = coins
    .filter((c) => !c.baseline)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0];

  return (
    <div className="border-b border-cyan-100 bg-cyan-50">
      <div className="max-w-6xl mx-auto px-4 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="flex items-center font-semibold text-cyan-800">
          🐋 고래 동향
          <InfoTooltip term="whale_activity" placement="bottom" />
        </span>

        {lead && <span className="text-xs text-cyan-700">{lead.mood}</span>}

        <span className="flex flex-wrap items-center gap-1.5">
          {coins.map((c) => (
            <CoinChip key={c.coin} c={c} onPick={(sym) => navigate(`/?symbol=${sym}`)} />
          ))}
        </span>

        <span className="text-slate-400 text-xs ml-auto hidden lg:inline">
          온체인 상위 지갑 잔고 변화 · 거래소 지갑 포함 가능 · 매매 신호 아님
        </span>
      </div>
    </div>
  );
}
