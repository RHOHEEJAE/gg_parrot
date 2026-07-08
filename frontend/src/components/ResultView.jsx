import EquityChart from "./EquityChart.jsx";
import SimBadge from "./SimBadge.jsx";
import InfoTooltip from "./InfoTooltip.jsx";
import { fmtMoney, fmtMoneyCompact } from "../lib/format.js";

function Stat({ label, value, term, color = "text-slate-100", title }) {
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700 px-4 py-3 min-w-0">
      <div className="flex items-center text-xs text-slate-400">
        {label}
        {term && <InfoTooltip term={term} />}
      </div>
      <div className={"text-2xl font-bold truncate " + color} title={title}>{value}</div>
    </div>
  );
}

export default function ResultView({ result, summary, dataSource, periodLabel, symbol }) {
  if (!result) return null;
  const r = result;
  const up = r.final_return_pct >= 0;
  const retColor = up ? "text-green-400" : "text-red-400";
  const sign = up ? "+" : "";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-slate-300">{summary}</div>
        <SimBadge />
      </div>

      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
        <div className="flex items-center text-sm text-slate-400 mb-1">
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
        <Stat label="MDD (최대낙폭)" term="mdd" value={`-${r.mdd_pct.toFixed(1)}%`} color="text-red-400" />
        <Stat label="총 매매 횟수" value={r.total_trades} />
        <Stat label="최종 평가금액" value={fmtMoneyCompact(r.final_equity, symbol)} title={fmtMoney(r.final_equity, symbol)} />
      </div>

      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
        <div className="text-sm text-slate-400 mb-3">자산곡선 (equity curve)</div>
        <EquityChart curve={r.equity_curve} />
      </div>

      {r.same_bar_sl_bars > 0 && (
        <div className="text-xs text-amber-400/90">
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
