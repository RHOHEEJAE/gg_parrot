// Always-on reminder that every number is a PAST SIMULATION, not live trading.
export default function SimBadge({ className = "" }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full bg-amber-950/60 border border-amber-700/50 " +
        "px-3 py-1 text-xs font-semibold text-amber-300 " +
        className
      }
      title="이 수치는 과거 데이터 시뮬레이션 결과이며 실제 거래가 아닙니다."
    >
      <span aria-hidden>⚠️</span>
      과거 시뮬레이션 결과 · 실거래 아님
    </span>
  );
}
