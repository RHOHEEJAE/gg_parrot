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

const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v) => (v >= 0 ? "text-green-600" : "text-red-600");

// Verdict on the winning cell: did the value picked on the training window
// still work on the window it was never allowed to see?
function verdict(best, v) {
  if (!v?.split) {
    return {
      cls: "border-amber-300 bg-amber-50 text-amber-800",
      icon: "⚠️",
      text: "기간이 짧아 검증을 못 했어요. 과거 전체에 맞춘 값이라 그대로 믿기 어렵습니다.",
    };
  }
  const oos = best.oos_return_pct;
  if (oos == null) return null;
  if (oos <= 0) {
    return {
      cls: "border-red-300 bg-red-50 text-red-800",
      icon: "❌",
      text: "학습 구간에선 좋았지만 검증 구간에선 손실입니다. 과거에 맞춘 값일 가능성이 높아요.",
    };
  }
  if (best.final_return_pct > 0 && oos < best.final_return_pct * 0.3) {
    return {
      cls: "border-amber-300 bg-amber-50 text-amber-800",
      icon: "⚠️",
      text: "검증 구간에서도 이익이지만 학습 구간보다 크게 나빠졌어요. 기대치를 낮춰 잡으세요.",
    };
  }
  return {
    cls: "border-green-300 bg-green-50 text-green-700",
    icon: "✅",
    text: "고를 때 쓰지 않은 검증 구간에서도 이익이 났습니다. 상대적으로 견고한 편이에요.",
  };
}

function BestSummary({ best, v }) {
  const info = verdict(best, v);
  return (
    <div className="space-y-2">
      <div className="text-sm text-slate-700">
        학습 구간 최적: <b>익절 {best.tp}% · 손절 {best.sl}%</b> →{" "}
        <b className={tone(best.final_return_pct)}>{pct(best.final_return_pct)}</b>{" "}
        <span className="text-slate-500">
          (MDD -{best.mdd_pct.toFixed(1)}% · 매매 {best.total_trades}회)
        </span>
      </div>

      {v?.split && best.oos_return_pct != null && (
        <div className="text-sm text-slate-700">
          같은 값의 <b>검증 구간</b> 성적:{" "}
          <b className={tone(best.oos_return_pct)}>{pct(best.oos_return_pct)}</b>{" "}
          <span className="text-slate-500">
            (매매 {best.oos_trades}회
            {v.overfit_gap != null && ` · 학습 대비 ${v.overfit_gap >= 0 ? "-" : "+"}${Math.abs(v.overfit_gap).toFixed(2)}%p`})
          </span>
        </div>
      )}

      {info && (
        <div className={"rounded-lg border px-3 py-2 text-xs " + info.cls}>
          {info.icon} {info.text}
        </div>
      )}

      {v?.split && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>학습 {v.train_label} ({v.train_bars}봉)</span>
          <span>검증 {v.test_label} ({v.test_bars}봉)</span>
          {v.generalization_rate != null && (
            <span>
              학습에서 이익이던 조합 중 <b>{v.generalization_rate}%</b>가 검증에서도 이익
            </span>
          )}
        </div>
      )}
    </div>
  );
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
        익절(가로)×손절(세로) 조합을 모두 돌려봅니다. 기간을 <b>학습</b>과 <b>검증</b>으로 나눠서, 학습 구간에서
        고른 값이 <b>고를 때 쓰지 않은 검증 구간</b>에서도 통했는지까지 확인해요. 칸을 클릭하면 빌더에 적용됩니다.
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
                            title={
                              `익절 ${tp}% · 손절 ${sl}%\n` +
                              `학습 ${c.final_return_pct.toFixed(2)}% · MDD -${c.mdd_pct.toFixed(1)}% · 샤프 ${c.sharpe ?? "—"} · 매매 ${c.total_trades}회\n` +
                              (c.oos_return_pct != null
                                ? `검증 ${c.oos_return_pct.toFixed(2)}% (매매 ${c.oos_trades}회)\n`
                                : "검증 구간 없음 (기간이 짧아요)\n") +
                              "클릭하면 빌더에 적용"
                            }
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
                            {/* Held-out result under the fitted one: a cell that
                                only worked because it was fitted shows it here. */}
                            {c.oos_return_pct != null && (
                              <span
                                className={
                                  "block text-[10px] font-semibold " +
                                  (c.oos_return_pct >= 0 ? "text-green-700" : "text-red-700")
                                }
                              >
                                검증 {c.oos_return_pct >= 0 ? "+" : ""}
                                {c.oos_return_pct.toFixed(1)}%
                              </span>
                            )}
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

          {data.best && <BestSummary best={data.best} v={data.validation} />}

          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            ⚠️ 과최적화 주의: 위 숫자는 <b>과거에 맞춰 고른</b> 값이라 미래 수익을 보장하지 않아요.
            특정 한 칸만 튀는 조합보다 <b>주변까지 고르게 좋은 구간</b>이 더 믿을 만합니다.
          </div>
        </>
      )}
    </div>
  );
}
