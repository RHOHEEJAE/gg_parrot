import EquityChart from "./EquityChart.jsx";
import SimBadge from "./SimBadge.jsx";
import InfoTooltip from "./InfoTooltip.jsx";
import { fmtMoney, fmtMoneyCompact, fmtKrw } from "../lib/format.js";
import { useUsdKrw } from "../lib/usdkrw.js";

// mascot mood -> accent color for the AI analysis card (neutral fallback).
const MOOD_ACCENT = {
  idle: "text-slate-700",
  liquidated: "text-red-700",
  crash: "text-red-700",
  loss: "text-amber-800",
  lost_to_hold: "text-amber-800",
  win: "text-green-700",
  big_win: "text-green-700",
};

const aiInputCls =
  "w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-sm text-slate-900 " +
  "focus:outline-none focus:ring-2 focus:ring-slate-500";

// 껄무새 AI 원인 분석 카드. 규칙기반 장문 멘트는 쓰지 않고, 키를 넣으면 AI가
// 결과 원인을 간결하게 분석한다(BYOK). 키는 이 브라우저에만 저장된다.
function ParrotExplain({ explanation, onAiExplain, aiBusy, aiError, geminiKey, onKeyChange }) {
  const isAi = explanation && explanation.source === "ai";

  // AI 분석 결과가 있을 때: 간결한 원인 분석만 렌더.
  if (isAi) {
    const accent = MOOD_ACCENT[explanation.mood] || MOOD_ACCENT.idle;
    return (
      <div className="rounded-2xl border-2 border-slate-300 bg-slate-50 p-5">
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none select-none" aria-hidden>🦜</div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-slate-500 mb-1">✨ AI 원인 분석</div>
            <div className={"text-base font-extrabold " + accent}>{explanation.headline}</div>
            {explanation.points?.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-slate-700 list-disc pl-5">
                {explanation.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              <div className="text-[11px] text-slate-400">{explanation.disclaimer}</div>
              <button
                type="button"
                onClick={onAiExplain}
                disabled={aiBusy}
                className="text-[11px] text-slate-500 underline disabled:opacity-40"
              >
                {aiBusy ? "분석 중…" : "다시 분석"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 아직 AI 분석 전: 키 입력 + 분석 버튼(BYOK). 규칙기반 장문은 노출하지 않음.
  const hasKey = (geminiKey || "").trim().length > 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        🦜 AI 원인 분석
        <span className="text-xs font-normal text-slate-400">이 결과가 왜 이렇게 나왔는지 분석해줘요</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          type="password"
          className={aiInputCls}
          placeholder="Gemini API 키 입력 (AIza…)"
          value={geminiKey || ""}
          onChange={(e) => onKeyChange && onKeyChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onAiExplain}
          disabled={aiBusy || !hasKey}
          className="shrink-0 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white"
        >
          {aiBusy ? "분석 중…" : "분석하기"}
        </button>
      </div>
      {aiError && <div className="mt-2 text-xs text-red-600">{aiError}</div>}
      <div className="mt-2 text-[11px] text-slate-400">
        🔒 키는 이 브라우저에만 저장되고, 분석할 때만 서버를 거쳐 Google로 전송돼요. 공용 PC에서는 사용하지 마세요.{" "}
        <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">키 발급</a>
      </div>
    </div>
  );
}

function Stat({ label, value, term, color = "text-slate-900", title, sub }) {
  return (
    <div className="rounded-xl bg-slate-100 border border-slate-300 px-4 py-3 min-w-0">
      <div className="flex items-center text-xs text-slate-500">
        {label}
        {term && <InfoTooltip term={term} />}
      </div>
      <div className={"text-2xl font-bold truncate " + color} title={title}>{value}</div>
      {sub && <div className="text-xs text-slate-500 truncate" title={sub}>{sub}</div>}
    </div>
  );
}

export default function ResultView({ result, explanation, onAiExplain, aiBusy, aiError, geminiKey, onKeyChange, summary, dataSource, periodLabel, symbol, leverage = 1 }) {
  if (!result) return null;
  const r = result;
  const up = r.final_return_pct >= 0;
  const retColor = up ? "text-green-600" : "text-red-600";
  const sign = up ? "+" : "";
  const levered = leverage > 1;
  const liq = r.liquidation_count || 0;
  const { rate: krwRate } = useUsdKrw();

  // Buy&Hold baseline comparison (null when the engine couldn't define it).
  const bh = r.buy_hold_return_pct != null ? r.buy_hold_return_pct : null;
  const vsHold = bh !== null ? r.final_return_pct - bh : 0;
  const beatHold = vsHold >= 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-slate-700">{summary}</div>
        <div className="flex items-center gap-2">
          {levered && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-300 px-3 py-1 text-xs font-bold text-red-700">
              ⚠️ 고위험 레버리지 {leverage}배
              <InfoTooltip term="leverage" />
            </span>
          )}
          <SimBadge />
        </div>
      </div>

      {liq > 0 && (
        <div className="rounded-2xl border-2 border-red-400 bg-red-50 p-5">
          <div className="text-lg font-extrabold text-red-700">
            ⚠️ 이 전략은 기간 중 {liq}번 청산되었습니다 (전액 손실)
          </div>
          <div className="mt-1 text-sm text-red-700">
            레버리지 {leverage}배로 인해 청산으로 잃은 금액{" "}
            <b>{fmtMoney(r.liquidated_loss || 0, symbol)}</b>
            {fmtKrw(r.liquidated_loss || 0, krwRate) && (
              <span className="font-normal"> ({fmtKrw(r.liquidated_loss || 0, krwRate)})</span>
            )}
            . 레버리지는 가격이 조금만 반대로 움직여도
            투입 증거금을 전부 잃게 만듭니다.
            <InfoTooltip term="liquidation" />
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-surface border border-slate-200 p-6">
        <div className="flex items-center text-sm text-slate-500 mb-1">
          백테스트 수익률 {periodLabel ? `· ${periodLabel}` : ""}
          <InfoTooltip term="backtest" />
        </div>
        <div className={"text-5xl font-extrabold " + retColor}>
          {sign}
          {r.final_return_pct.toFixed(2)}%
        </div>
        {bh !== null && (
          <div className="mt-3 flex items-center flex-wrap gap-2 text-sm">
            <span className="text-slate-500">
              그냥 홀딩(HODL)했다면{" "}
              <b className={bh >= 0 ? "text-green-600" : "text-red-600"}>
                {bh >= 0 ? "+" : ""}{bh.toFixed(2)}%
              </b>
            </span>
            <span
              className={
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold " +
                (beatHold
                  ? "border-green-300 bg-green-50 text-green-700"
                  : "border-red-300 bg-red-50 text-red-700")
              }
            >
              {beatHold ? "▲ 홀딩보다" : "▼ 홀딩보다"} {vsHold >= 0 ? "+" : ""}
              {vsHold.toFixed(2)}%p {beatHold ? "초과" : "미달"}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="승률" term="win_rate" value={`${r.win_rate_pct.toFixed(1)}%`} />
        <Stat label="MDD (최대낙폭)" term="mdd" value={`-${r.mdd_pct.toFixed(1)}%`} color="text-red-600" />
        <Stat label="총 매매 횟수" value={r.total_trades} />
        <Stat label="최종 평가금액" value={fmtMoneyCompact(r.final_equity, symbol)} title={fmtMoney(r.final_equity, symbol)} sub={fmtKrw(r.final_equity, krwRate)} />
        <Stat
          label="샤프지수"
          term="sharpe"
          value={r.sharpe != null ? r.sharpe.toFixed(2) : "—"}
          color={r.sharpe != null && r.sharpe >= 1 ? "text-green-600" : "text-slate-900"}
        />
        <Stat
          label="손익비 (PF)"
          term="profit_factor"
          value={r.profit_factor != null ? r.profit_factor.toFixed(2) : "—"}
          color={r.profit_factor != null && r.profit_factor >= 1 ? "text-green-600" : "text-slate-900"}
        />
        <Stat
          label="최대 연속손절"
          value={`${r.max_consecutive_losses || 0}회`}
          color={(r.max_consecutive_losses || 0) >= 5 ? "text-red-600" : "text-slate-900"}
        />
      </div>

      <ParrotExplain
        explanation={explanation}
        onAiExplain={onAiExplain}
        aiBusy={aiBusy}
        aiError={aiError}
        geminiKey={geminiKey}
        onKeyChange={onKeyChange}
      />

      <div className="rounded-2xl bg-surface border border-slate-200 p-6">
        <div className="text-sm text-slate-500 mb-3">자산곡선 (equity curve)</div>
        <EquityChart curve={r.equity_curve} />
      </div>

      {r.same_bar_sl_bars > 0 && (
        <div className="text-xs text-amber-600">
          한 봉에서 익절·손절이 동시에 닿은 봉 {r.same_bar_sl_bars}개 — 보수적으로 <b>손절 우선</b>으로 처리했습니다.
        </div>
      )}

      {dataSource && (
        <div className="text-xs text-slate-500">
          데이터 소스: {dataSource === "binance-futures" ? "바이낸스 선물(USDT-M)" : dataSource}
          {dataSource === "binance-futures" && " · 실제 선물 캔들"}
          {dataSource === "synthetic" && " (오프라인 폴백 · 합성 데이터)"}
        </div>
      )}
    </div>
  );
}
