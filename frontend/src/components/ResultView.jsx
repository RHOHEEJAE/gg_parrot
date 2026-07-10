import EquityChart from "./EquityChart.jsx";
import SimBadge from "./SimBadge.jsx";
import InfoTooltip from "./InfoTooltip.jsx";
import { fmtMoney, fmtMoneyCompact } from "../lib/format.js";

function Stat({ label, value, term, color = "text-slate-900", title }) {
  return (
    <div className="rounded-xl bg-slate-100 border border-slate-300 px-4 py-3 min-w-0">
      <div className="flex items-center text-xs text-slate-500">
        {label}
        {term && <InfoTooltip term={term} />}
      </div>
      <div className={"text-2xl font-bold truncate " + color} title={title}>{value}</div>
    </div>
  );
}

export default function ResultView({ result, summary, dataSource, periodLabel, symbol, leverage = 1 }) {
  if (!result) return null;
  const r = result;
  const up = r.final_return_pct >= 0;
  const retColor = up ? "text-green-600" : "text-red-600";
  const sign = up ? "+" : "";
  const levered = leverage > 1;
  const liq = r.liquidation_count || 0;

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
            <b>{fmtMoney(r.liquidated_loss || 0, symbol)}</b>. 레버리지는 가격이 조금만 반대로 움직여도
            투입 증거금을 전부 잃게 만듭니다.
            <InfoTooltip term="liquidation" />
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white border border-slate-200 p-6">
        <div className="flex items-center text-sm text-slate-500 mb-1">
          백테스트 수익률 {periodLabel ? `· ${periodLabel}` : ""}
          <InfoTooltip term="backtest" />
        </div>
        <div className={"text-5xl font-extrabold " + retColor}>
          {sign}
          {r.final_return_pct.toFixed(2)}%
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="승률" term="win_rate" value={`${r.win_rate_pct.toFixed(1)}%`} />
        <Stat label="MDD (최대낙폭)" term="mdd" value={`-${r.mdd_pct.toFixed(1)}%`} color="text-red-600" />
        <Stat label="총 매매 횟수" value={r.total_trades} />
        <Stat label="최종 평가금액" value={fmtMoneyCompact(r.final_equity, symbol)} title={fmtMoney(r.final_equity, symbol)} />
      </div>

      <div className="rounded-2xl bg-white border border-slate-200 p-6">
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
          데이터 소스: {dataSource}
          {dataSource === "synthetic" && " (오프라인 폴백 · 합성 데이터)"}
        </div>
      )}
    </div>
  );
}
