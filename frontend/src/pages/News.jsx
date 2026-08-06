import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { AnnotatedText, TermChips } from "../components/NewsTerms.jsx";
import { PageHeader, Loading, ErrorNote } from "../components/Page.jsx";

// '오늘의 코인동향' — 무료(Google News RSS) 뉴스 요약 페이지.
// 팩트(실제 헤드라인 + 원문 링크)를 그대로 보여주고, 시장 페이지 상단에만
// AI가 '주어진 헤드라인 근거'로 중립 개요를 붙인다. 자문 아님(면책 표기).

function coinOf(sym) {
  return (sym || "").replace(/USDT$|BUSD$|USDC$/, "");
}

function Disclaimer({ text }) {
  return (
    <div className="notice-warn mt-4 t-caption text-slate-700">
      <b className="text-slate-900">주의 · </b>{text}
    </div>
  );
}

// 헤드라인 목록 — 제목/매체/시각 + 원문 링크(새 탭). 기사 전문은 싣지 않음(저작권).
function NewsList({ items, empty }) {
  if (!items || items.length === 0) {
    return <div className="t-small text-slate-500 py-4">{empty || "최근 뉴스가 없어요."}</div>;
  }
  return (
    <ul className="divide-y divide-slate-200 border-t border-slate-200">
      {items.map((it, i) => (
        <li key={i} className="py-3">
          <a
            href={it.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-2"
          >
            <span className="min-w-0">
              <span className="block t-label text-slate-900 group-hover:underline underline-offset-4 leading-snug">
                {it.title}
              </span>
              <span className="mt-1 block t-caption text-slate-500">
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
  // 아코디언 행도 카드가 아니라 괘선 리스트(§6 board-row 와 같은 구조).
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`coin-news-${coin.symbol}`}
        className="w-full flex items-center justify-between gap-3 py-4 hover:bg-slate-100 -mx-2 px-2 rounded-lg"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className="t-title text-slate-900">{coinOf(coin.symbol)}</span>
          <span className={"t-label font-bold num " + (up ? "text-green-600" : "text-red-600")}>
            {up ? "+" : ""}{(coin.change_pct ?? 0).toFixed(2)}%
          </span>
        </span>
        <span className="t-small font-semibold text-slate-500 shrink-0">{open ? "접기 ▲" : "뉴스 보기 ▼"}</span>
      </button>
      {open && (
        <div id={`coin-news-${coin.symbol}`} className="pb-4">
          {busy && <div className="t-small text-slate-500 py-3">불러오는 중…</div>}
          {err && <div className="t-small text-red-600 py-3">뉴스를 불러오지 못했어요.</div>}
          {data && (
            <>
              <NewsList items={data.items} empty={`${data.coin_name || coinOf(coin.symbol)} 관련 최근 뉴스가 없어요.`} />
              {data.items?.length > 0 && <TermChips texts={data.items.map((i) => i.title)} />}
              <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                <Link
                  to={`/builder?symbol=${encodeURIComponent(coin.symbol)}`}
                  className="t-small font-semibold text-slate-900 underline underline-offset-4 decoration-slate-300 hover:decoration-slate-900"
                >
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
    <div className="max-w-3xl mx-auto">
      <PageHeader
        eyebrow="시장·규제 헤드라인"
        title="오늘의 코인동향"
        description={
          "코인 시장·규제 관련 최신 뉴스를 하루 한 번 모아 요약해요." +
          (market?.as_of ? ` (기준 ${market.as_of} · KST)` : "")
        }
      />

      {busy && <Loading />}
      {err && <ErrorNote>오류: {err}</ErrorNote>}

      {/* 시장·규제 전반 */}
      {market && (
        <section>
          <h2 className="t-h4 text-slate-900 mb-1">시장·규제 한눈에</h2>
          {market.overview ? (
            <div className="notice mt-3">
              <div className="t-caption text-slate-500 mb-1">AI 요약</div>
              <p className="t-label font-medium text-slate-700 whitespace-pre-line leading-relaxed measure">
                <AnnotatedText text={market.overview} />
              </p>
            </div>
          ) : (
            <p className="t-small text-slate-700 mt-1">아래 최신 헤드라인을 확인해 봐요.</p>
          )}

          <h3 className="mt-6 mb-2 t-title text-slate-900">최신 헤드라인</h3>
          <NewsList items={market.items} empty="지금은 불러올 뉴스가 없어요. 잠시 후 다시 시도해 주세요." />
          <TermChips texts={[market.overview, ...(market.items || []).map((i) => i.title)]} />
          {market.disclaimer && <Disclaimer text={market.disclaimer} />}
        </section>
      )}

      {/* 경주마 동향 */}
      <section className="mt-10">
        <h2 className="t-h4 text-slate-900 mb-1">경주마 동향</h2>
        <p className="t-small text-slate-700 mb-3">
          '오늘의 경주마'(급등·활발히 거래되는 코인)별 최신 뉴스예요. 코인을 눌러 펼쳐 봐요.
        </p>
        {coins.length === 0 && !busy ? (
          <div className="t-small text-slate-500">지금은 보여줄 경주마가 없어요.</div>
        ) : (
          <div className="border-t border-slate-200">
            {coins.map((c) => (
              <CoinRow key={c.symbol} coin={c} />
            ))}
          </div>
        )}
        <p className="mt-4 t-caption text-slate-500">
          경주마 선정과 뉴스는 참고용이고 투자 권유가 아니에요.
        </p>
      </section>
    </div>
  );
}
