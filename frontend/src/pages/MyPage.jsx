import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth, updateAuthUser } from "../lib/auth.js";

const P = (n) => `${(n ?? 0).toLocaleString()}P`;

const REASON_KO = {
  signup_grant: "가입 보너스",
  unlock_spend: "매크로 언락(구매)",
  unlock_earn: "판매 수익",
  topup: "충전",
};

function Section({ title, count, children }) {
  return (
    <section className="rounded-2xl bg-surface border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {count != null && <span className="text-xs text-slate-400">({count})</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <div className="text-sm text-slate-400 py-4 text-center">{children}</div>;
}

export default function MyPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    api.myDashboard()
      .then((d) => {
        setData(d);
        updateAuthUser(d.user); // sync header points
      })
      .catch((e) => setError(String(e.message || e)));
  }, [token]);

  if (!token) return null;
  if (error) return <div className="text-red-600">오류: {error}</div>;
  if (!data) return <div className="text-slate-500">불러오는 중…</div>;

  const { user, tier, totals, created, purchased, sales, ledger } = data;

  return (
    <div className="space-y-6">
      {/* profile + tier + points */}
      <div className="rounded-2xl bg-surface border border-slate-200 p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{tier.icon}</span>
            <span className="text-xl font-bold">{user.username}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-600">
              {tier.name} 등급
            </span>
          </div>
          <div className="text-sm text-slate-500 mt-1">{user.email}</div>
          {tier.next_name && (
            <div className="text-xs text-slate-400 mt-1">
              다음 등급 <b>{tier.next_name}</b>까지 판매 {tier.to_next}건 남음 (누적 판매 {tier.sales}건)
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">보유 포인트</div>
          <div className="text-3xl font-extrabold text-amber-700">🪙 {P(user.points_balance)}</div>
        </div>
      </div>

      {/* totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ["내가 만든 매크로", totals.created + "개"],
          ["누적 판매", totals.sales + "건"],
          ["판매 수익", P(totals.earned)],
          ["구매한 매크로", totals.purchased + "개"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-100 border border-slate-300 px-4 py-3">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-xl font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      {/* created */}
      <Section title="🛠 내가 만든 매크로" count={created.length}>
        {created.length === 0 ? (
          <Empty>아직 리더보드에 등록한 매크로가 없어요. 빌더에서 만들어 등록해보세요.</Empty>
        ) : (
          <div className="divide-y divide-slate-100">
            {created.map((m) => (
              <div key={m.entry_id} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{m.symbol}</div>
                  <div className="text-xs text-slate-500 truncate">{m.human_summary}</div>
                </div>
                <div className="text-sm text-slate-600 tabular-nums">
                  판매 <b>{m.sales}</b> · 수익 <b className="text-amber-700">{P(m.earned)}</b>
                  <span className="text-xs text-slate-400"> · {m.created_kst}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* purchased */}
      <Section title="🛒 구매한 매크로" count={purchased.length}>
        {purchased.length === 0 ? (
          <Empty>구매(언락)한 매크로가 없어요. 리더보드에서 마음에 드는 전략을 열어보세요.</Empty>
        ) : (
          <div className="divide-y divide-slate-100">
            {purchased.map((m, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2.5 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{m.symbol} <span className="text-xs text-slate-400">· @{m.seller}</span></div>
                  <div className="text-xs text-slate-500 truncate">{m.human_summary}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-500 tabular-nums">-{P(m.price)}</span>
                  <button
                    onClick={() => navigate("/builder", { state: { macro: m.macro } })}
                    className="px-2 py-1 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    📋 빌더로
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* sales history */}
      <Section title="💰 내 매크로 판매 내역" count={sales.length}>
        {sales.length === 0 ? (
          <Empty>아직 판매(다른 사람의 언락)가 없어요.</Empty>
        ) : (
          <div className="divide-y divide-slate-100">
            {sales.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="text-slate-700">
                  <b>@{s.buyer}</b> 님이 <b>{s.symbol}</b> 매크로를 언락
                </div>
                <div className="text-amber-700 font-semibold tabular-nums">+{P(s.earned)}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ledger */}
      <Section title="📒 포인트 내역" count={ledger.length}>
        {ledger.length === 0 ? (
          <Empty>포인트 변동 내역이 없어요.</Empty>
        ) : (
          <div className="divide-y divide-slate-100">
            {ledger.map((l, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="text-slate-600">{REASON_KO[l.reason] || l.reason}</div>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className={l.delta >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                    {l.delta >= 0 ? "+" : ""}{l.delta.toLocaleString()}P
                  </span>
                  <span className="text-xs text-slate-400 w-16 text-right">잔액 {l.balance_after.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <p className="text-xs text-slate-400 text-center">
        포인트는 서비스 내 가상 재화이며, 본 서비스는 실거래/투자 자문이 아닙니다.
      </p>
    </div>
  );
}
