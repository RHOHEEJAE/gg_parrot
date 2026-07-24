import { useState } from "react";
import { api } from "../api.js";
import { buildMacro } from "../lib/macro.js";
import InfoTooltip from "./InfoTooltip.jsx";

// Green→red heat color for a return% relative to the grid's [min,max] range.
// Mid (0-ish within range) stays pale so extremes read clearly.
//
// Saturation/lightness come from CSS vars (see index.css) so the scale inverts
// with the theme — the cell label is `text-slate-800`, which goes light in dark
// mode and would otherwise sit on a near-white swatch. Using vars (rather than
// reading the theme in JS) also means the grid repaints on toggle for free.
function heatStyle(value, min, max) {
  if (max <= min) return { background: "rgb(var(--c-slate-100))" };
  const t = (value - min) / (max - min); // 0 = worst, 1 = best
  // interpolate red(0) -> amber(0.5) -> green(1)
  const hue = 0 + t * 130; // 0=red .. 130=green
  const dip = (Math.abs(t - 0.5) * 18).toFixed(1); // deeper toward the extremes
  return {
    background: `hsl(${hue} var(--heat-s) calc(var(--heat-l) - ${dip}%))`,
  };
}

export default function OptimizePanel({ form, setForm, valErr }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  // Only rule A carries take_profit_pct + stop_loss to sweep.
  if (form.rule_type !== "A") return null;

  async function run() {
    setError("");
    if (valErr) return setError(valErr);
    setBusy(true);
    try {
      const res = await api.optimize(buildMacro(form));
      setData(res);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  function applyCell(tp, sl) {
    setForm((f) => ({ ...f, take_profit_pct: tp, stop_loss_pct: sl, use_stop_loss: true }));
  }

  const returns = data ? data.cells.map((c) => c.final_return_pct) : [];
  const min = returns.length ? Math.min(...returns) : 0;
  const max = returns.length ? Math.max(...returns) : 0;
  const cellAt = (tp, sl) =>
    data?.cells.find((c) => c.tp === tp && c.sl === sl) || null;
  const isCurrent = (tp, sl) =>
    data && data.current && data.current.tp === tp && data.current.sl === sl;
  const isBest = (tp, sl) => data?.best && data.best.tp === tp && data.best.sl === sl;

  return (
    <div className="rounded-2xl bg-surface border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center text-sm font-semibold text-slate-700">
          🔍 익절 / 손절 자동 최적화
          <InfoTooltip term="optimize" />
        </div>
        <button
          onClick={run}
          disabled={busy || !!valErr}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white"
        >
          {busy ? "최적화 중…" : data ? "다시 최적화" : "최적화 실행"}
        </button>
      </div>

      <p className="text-xs text-slate-500">
        같은 종목·기간으로 익절(가로)×손절(세로) 조합을 모두 돌려, 그때 수익률이 가장 좋았던 구간을 찾아요.
        칸을 클릭하면 그 값이 빌더에 적용됩니다.
      </p>

      {error && <div className="text-sm text-red-600">오류: {error}</div>}

      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="p-1.5 text-slate-400 font-medium sticky left-0 bg-surface">손절＼익절</th>
                  {data.tp_values.map((tp) => (
                    <th key={tp} className="p-1.5 text-slate-500 font-medium text-center">
                      {tp}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sl_values.map((sl) => (
                  <tr key={sl}>
                    <td className="p-1.5 text-slate-500 font-medium sticky left-0 bg-surface">{sl}%</td>
                    {data.tp_values.map((tp) => {
                      const c = cellAt(tp, sl);
                      if (!c) return <td key={tp} />;
                      const best = isBest(tp, sl);
                      const cur = isCurrent(tp, sl);
                      return (
                        <td key={tp} className="p-0.5">
                          <button
                            onClick={() => applyCell(tp, sl)}
                            title={`익절 ${tp}% · 손절 ${sl}%\n수익률 ${c.final_return_pct.toFixed(2)}% · MDD -${c.mdd_pct.toFixed(1)}% · 샤프 ${c.sharpe ?? "—"} · 매매 ${c.total_trades}회\n클릭하면 빌더에 적용`}
                            style={heatStyle(c.final_return_pct, min, max)}
                            className={
                              "w-full min-w-[64px] rounded px-1.5 py-2 text-center font-semibold text-slate-800 transition " +
                              "hover:ring-2 hover:ring-indigo-400 " +
                              (best ? "outline outline-2 outline-green-600 " : "") +
                              (cur ? "ring-2 ring-blue-500 " : "")
                            }
                          >
                            {c.final_return_pct >= 0 ? "+" : ""}
                            {c.final_return_pct.toFixed(1)}%
                            {best && <span className="block text-[10px] font-bold text-green-700">★ 최적</span>}
                            {cur && !best && <span className="block text-[10px] text-blue-600">현재</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.best && (
            <div className="text-sm text-slate-700">
              이 기간 최적: <b>익절 {data.best.tp}% · 손절 {data.best.sl}%</b> →{" "}
              <b className={data.best.final_return_pct >= 0 ? "text-green-600" : "text-red-600"}>
                {data.best.final_return_pct >= 0 ? "+" : ""}
                {data.best.final_return_pct.toFixed(2)}%
              </b>{" "}
              <span className="text-slate-500">
                (MDD -{data.best.mdd_pct.toFixed(1)}% · 매매 {data.best.total_trades}회)
              </span>
            </div>
          )}

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            ⚠️ 과최적화 주의: 여기서 가장 좋아 보이는 값은 <b>과거에만</b> 잘 맞았던 값일 수 있어요.
            미래 수익을 보장하지 않으며, 특정 한 칸만 튀는 조합보다 <b>주변까지 고르게 좋은 구간</b>이 더 믿을 만해요.
          </div>
        </>
      )}
    </div>
  );
}
