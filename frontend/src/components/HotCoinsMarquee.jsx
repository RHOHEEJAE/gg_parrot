import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { fmtPrice } from "../lib/format.js";

// Poll interval (ms). Server caches the aggregate, so this is cheap. Default 45s.
const POLL_MS = Number(import.meta.env?.VITE_HOTCOINS_POLL_MS) || 45000;

function Item({ coin, onPick, ariaHidden }) {
  const up = coin.change_pct >= 0;
  const color = up ? "text-green-400" : "text-red-400";
  return (
    <button
      type="button"
      aria-hidden={ariaHidden || undefined}
      tabIndex={ariaHidden ? -1 : 0}
      onClick={() => onPick(coin.symbol)}
      title={`${coin.symbol} 로 매크로 만들기`}
      className="inline-flex items-center gap-1.5 px-4 py-0.5 hover:bg-slate-800/60 rounded-md transition-colors"
    >
      <span className="font-bold text-slate-100">{coin.base}</span>
      <span className={`font-semibold tabular-nums ${color}`}>
        {up ? "▲" : "▼"}{Math.abs(coin.change_pct).toFixed(2)}%
      </span>
      <span className="text-xs text-slate-400 tabular-nums">${fmtPrice(coin.last_price)}</span>
    </button>
  );
}

export default function HotCoinsMarquee() {
  const [coins, setCoins] = useState([]);
  const navigate = useNavigate();
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const d = await api.hotCoins(10);
        if (alive) setCoins(Array.isArray(d.coins) ? d.coins : []);
      } catch (_) {
        // network/agg error: keep last list, never break the page
      }
    }
    tick();
    timer.current = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer.current);
    };
  }, []);

  // Nothing to show yet -> hide the strip entirely (spec §1.4).
  if (!coins.length) return null;

  const pick = (symbol) => {
    // Prefill the builder with the full pair (e.g. XRPUSDT) via query param.
    navigate(`/?symbol=${encodeURIComponent(symbol)}`);
  };

  // Speed scales with count so the flow feels consistent regardless of list size.
  const duration = `${Math.max(24, coins.length * 4)}s`;
  const group = (hidden) =>
    coins.map((c) => <Item key={(hidden ? "b-" : "a-") + c.symbol} coin={c} onPick={pick} ariaHidden={hidden} />);

  return (
    <div className="fixed bottom-0 inset-x-0 z-20 border-t border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="flex items-center">
        <div className="shrink-0 px-3 py-2 text-sm font-bold text-amber-300 border-r border-slate-800 flex items-center gap-1">
          🐎 <span className="hidden sm:inline">오늘의 경주마</span>
        </div>

        <div className="ggp-marquee overflow-hidden flex-1 py-1.5">
          <div className="ggp-marquee-track text-sm" style={{ "--ggp-marquee-duration": duration }}>
            {group(false)}
            {group(true)}
          </div>
        </div>

        <div className="shrink-0 hidden md:block px-3 text-[10px] leading-tight text-slate-500 max-w-[13rem]">
          급등 종목은 참고용이며 투자 조언이 아닙니다. 급등 코인은 변동성·손실 위험이 큽니다.
        </div>
      </div>
    </div>
  );
}
