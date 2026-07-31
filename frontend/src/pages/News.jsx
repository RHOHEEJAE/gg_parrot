import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { AnnotatedText, TermChips } from "../components/NewsTerms.jsx";

// '오늘의 코인동향' — 무료(Google News RSS) 뉴스 요약 페이지.
// 팩트(실제 헤드라인 + 원문 링크)를 그대로 보여주고, 시장 페이지 상단에만
// AI가 '주어진 헤드라인 근거'로 중립 개요를 붙인다. 자문 아님(면책 표기).

function coinOf(sym) {
  return (sym || "").replace(/USDT$|BUSD$|USDC$/, "");
}

function Disclaimer({ text }) {
  return (
    <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
      ⚠️ {text}
    </div>
  );
}

// 헤드라인 목록 — 제목/매체/시각 + 원문 링크(새 탭). 기사 전문은 싣지 않음(저작권).
function NewsList({ items, empty }) {
  if (!items || items.length === 0) {
    return <div className="text-sm text-slate-400 py-4">{empty || "최근 뉴스가 없어요."}</div>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((it, i) => (
        <li key={i} className="py-2.5">
          <a
            href={it.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-2"
          >
            <span className="mt-0.5 text-slate-300 group-hover:text-indigo-400">🔗</span>
            <span className="min-w-0">
              <span className="block text-sm text-slate-800 group-hover:text-indigo-600 leading-snug">
                {it.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-slate-400">
                {it.source}
                {it.published_display ? ` · ${it.published_display}` : ""}
              </span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// 경주마 코인 하나 — 클릭하면 그 코인 뉴스를 그때 불러온다(지연 로딩 = 비용 절약).
function CoinRow({ coin }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data && !busy) {
      setBusy(true);
      api
        .newsCoin(coin.symbol)
        .then((d) => setData(d))
        .catch((e) => setErr(String(e.message || e)))
        .finally(() => setBusy(false));
    }
  }

  const up = (coin.change_pct ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-surface overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-slate-900">{coinOf(coin.symbol)}</span>
          <span className={"text-xs font-semibold tabular-nums " + (up ? "text-green-600" : "text-red-600")}>
            {up ? "+" : ""}{(coin.change_pct ?? 0).toFixed(2)}%
          </span>
        </span>
        <span className="text-slate-400 text-sm shrink-0">{open ? "접기 ▲" : "뉴스 보기 ▼"}</span>
      </button>
      {open && (
        <div className="px-4 pb-3 border-t border-slate-100">
          {busy && <div className="text-sm text-slate-400 py-3">불러오는 중…</div>}
          {err && <div className="text-sm text-red-600 py-3">뉴스를 불러오지 못했어요.</div>}
          {data && (
            <>
              <NewsList items={data.items} empty={`${data.coin_name || coinOf(coin.symbol)} 관련 최근 뉴스가 없어요.`} />
              {data.items?.length > 0 && <TermChips texts={data.items.map((i) => i.title)} />}
              <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                <Link to={`/builder?symbol=${encodeURIComponent(coin.symbol)}`} className="text-xs text-indigo-600 hover:underline">
                  이 코인으로 매크로 만들기 →
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function News() {
  const [market, setMarket] = useState(null);
  const [coins, setCoins] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setBusy(true);
    Promise.all([api.newsMarket(), api.hotCoins(10).catch(() => ({ coins: [] }))])
      .then(([m, hc]) => {
        if (!alive) return;
        setMarket(m);
        setCoins(hc.coins || []);
      })
      .catch((e) => alive && setErr(String(e.message || e)))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">📰 오늘의 코인동향</h1>
        <p className="mt-1 text-sm text-slate-500">
          코인 시장·규제 관련 최신 뉴스를 하루 한 번 모아 요약해요.
          {market?.as_of ? ` (기준 ${market.as_of} · KST)` : ""}
        </p>
      </div>

      {busy && <div className="text-slate-400">불러오는 중…</div>}
      {err && <div className="text-red-600 text-sm">오류: {err}</div>}

      {/* 시장·규제 전반 */}
      {market && (
        <section className="rounded-2xl bg-surface border border-slate-200 p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">🌐 시장·규제 한눈에</h2>
          {market.overview ? (
            <div className="mt-2 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-3">
              <div className="text-[11px] font-semibold text-indigo-600 mb-1">🦜 껄무새 AI 요약</div>
              <p className="text-sm text-indigo-900 whitespace-pre-line leading-relaxed">
                <AnnotatedText text={market.overview} />
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500 mt-1">아래 최신 헤드라인을 확인해 보세요.</p>
          )}

          <h3 className="mt-5 mb-1 text-sm font-semibold text-slate-600">최신 헤드라인</h3>
          <NewsList items={market.items} empty="지금은 불러올 뉴스가 없어요. 잠시 후 다시 시도해 주세요." />
          <TermChips texts={[market.overview, ...(market.items || []).map((i) => i.title)]} />
          {market.disclaimer && <Disclaimer text={market.disclaimer} />}
        </section>
      )}

      {/* 경주마 동향 */}
      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-1">🏇 경주마 동향</h2>
        <p className="text-sm text-slate-500 mb-3">
          '오늘의 경주마'(급등·활발히 거래되는 코인)별 최신 뉴스예요. 코인을 눌러 펼쳐 보세요.
        </p>
        {coins.length === 0 && !busy ? (
          <div className="text-sm text-slate-400">지금은 표시할 경주마가 없어요.</div>
        ) : (
          <div className="space-y-2">
            {coins.map((c) => (
              <CoinRow key={c.symbol} coin={c} />
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          경주마 선정과 뉴스는 참고용이며 투자 권유가 아니에요.
        </p>
      </section>
    </div>
  );
}
