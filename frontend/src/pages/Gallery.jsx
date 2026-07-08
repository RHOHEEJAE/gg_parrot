import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import SimBadge from "../components/SimBadge.jsx";
import { api } from "../api.js";

export default function Gallery() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    api
      .gallery()
      .then((d) => setItems(d.items))
      .catch((e) => setError(String(e.message || e)))
      .finally(() => setBusy(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h2 className="text-lg font-semibold">매크로 갤러리 · 백테스트 수익률순</h2>
        <SimBadge />
      </div>
      <p className="text-sm text-slate-500 mb-6">
        표시되는 모든 수익률은 과거 데이터 백테스트 기준입니다. 실거래 인증·카피트레이딩이 아닙니다.
      </p>

      {busy && <div className="text-slate-500">불러오는 중…</div>}
      {error && <div className="text-red-400">오류: {error}</div>}
      {!busy && items.length === 0 && (
        <div className="text-slate-500">아직 공유된 매크로가 없습니다. 빌더에서 먼저 저장해 보세요.</div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {items.map((it, idx) => {
          const up = it.return_pct >= 0;
          return (
            <div key={it.share_slug} className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="text-xs text-slate-500">#{idx + 1} · {it.period_label}</div>
                <div className={"text-2xl font-bold " + (up ? "text-green-400" : "text-red-400")}>
                  {up ? "+" : ""}
                  {it.return_pct.toFixed(2)}%
                </div>
              </div>
              <div className="mt-2 text-slate-200">{it.human_summary}</div>
              <div className="mt-3 flex gap-4 text-xs text-slate-400">
                <span>승률 {it.win_pct.toFixed(1)}%</span>
                <span>MDD -{it.mdd_pct.toFixed(1)}%</span>
                <span>매매 {it.trades}회</span>
              </div>
              <div className="mt-4">
                <Link
                  to={`/s/${it.share_slug}`}
                  className="inline-block rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold"
                >
                  복제하기 →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
