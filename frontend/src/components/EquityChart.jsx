// Dependency-free SVG line chart of the equity curve (deterministic, offline-safe).
export default function EquityChart({ curve }) {
  if (!curve || curve.length < 2) {
    return <div className="text-slate-500 text-sm">자산곡선 데이터가 없습니다.</div>;
  }
  const W = 720;
  const H = 240;
  const pad = { l: 8, r: 8, t: 12, b: 20 };
  const values = curve.map((p) => p.equity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = curve.length;

  const x = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z`;

  const up = values[n - 1] >= values[0];
  // Theme-aware (see index.css): the vars hold bare "R G B" triplets, so the
  // same value serves both the solid stroke and the translucent area fill.
  const rgb = up ? "var(--chart-up)" : "var(--chart-down)";
  const stroke = `rgb(${rgb})`;
  const fill = `rgb(${rgb} / 0.12)`;

  const first = curve[0].t.slice(0, 10);
  const last = curve[n - 1].t.slice(0, 10);

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        <path d={area} fill={fill} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" />
      </svg>
      <div className="flex justify-between text-xs text-slate-500 mt-1">
        <span>{first}</span>
        <span>{last}</span>
      </div>
    </div>
  );
}
