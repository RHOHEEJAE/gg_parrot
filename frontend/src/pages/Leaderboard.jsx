import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SimBadge from "../components/SimBadge.jsx";
import RegisterMacroModal from "../components/RegisterMacroModal.jsx";
import ChatBox from "../components/ChatBox.jsx";
import { api } from "../api.js";
import { getUserId } from "../lib/user.js";
import { useAuth, isLoggedIn, getAuthUser, updateAuthUser } from "../lib/auth.js";

const pad = (n) => String(n).padStart(2, "0");
const fmtCountdown = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

function ret(e) {
  if (e.return_pct == null) return { text: "집계중…", cls: "text-slate-500" };
  const up = e.return_pct >= 0;
  return { text: `${up ? "+" : ""}${e.return_pct.toFixed(2)}%`, cls: up ? "text-green-600" : "text-red-600" };
}

export default function Leaderboard() {
  const uid = getUserId();
  const navigate = useNavigate();
  useAuth(); // re-render on login/logout so gating reflects the current account
  const [items, setItems] = useState([]);
  const [unlocking, setUnlocking] = useState(0); // entry id being unlocked
  const [remain, setRemain] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false); // false | {edit?: entry}
  const loadRef = useRef(null);

  async function load() {
    try {
      const d = await api.leaderboard(uid);
      setItems(d.items || []);
      setRemain(d.seconds_to_reset || 0);
      setError("");
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }
  loadRef.current = load;

  // Poll live returns every 5s; tick the countdown every 1s locally.
  useEffect(() => {
    load();
    const poll = setInterval(() => loadRef.current(), 5000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const t = setInterval(() => setRemain((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  async function vote(id, value) {
    try {
      await api.leaderboardVote(id, uid, value);
      load();
    } catch (_) {}
  }

  function copyToBuilder(entry) {
    // Reuse the clone/prefill path: pass the full macro to the builder via state.
    navigate("/builder", { state: { macro: entry.macro } });
  }

  async function unlock(entry) {
    if (!isLoggedIn()) {
      navigate("/login?mode=signup");
      return;
    }
    setError("");
    setUnlocking(entry.id);
    try {
      const d = await api.leaderboardUnlock(entry.id);
      if (d.points_balance != null) {
        updateAuthUser({ ...getAuthUser(), points_balance: d.points_balance });
      }
      await load(); // reveal the now-unlocked macro
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setUnlocking(0);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-semibold">🏆 오늘의 리더보드</h2>
        <SimBadge />
      </div>

      {/* countdown + register */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6 rounded-2xl bg-surface border border-slate-200 px-5 py-4">
        <div className="text-sm text-slate-700">
          리더보드 초기화까지{" "}
          <span className="font-bold tabular-nums text-amber-700">{fmtCountdown(remain)}</span>{" "}
          <span className="text-slate-500">남음 (매일 KST 00:00 초기화)</span>
        </div>
        <button
          onClick={() => setModal({})}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold text-white"
        >
          + 나만의 매크로 등록
        </button>
      </div>

      <p className="text-sm text-slate-500 mb-4">
        실시간 <b>모의(페이퍼)</b> 수익률과 좋아요로 겨루는 오늘의 보드입니다. 좋아요·수익률은 참고용이며 매수 추천/신호가 아닙니다.
      </p>

      {busy && <div className="text-slate-500">불러오는 중…</div>}
      {error && <div className="text-red-600">오류: {error}</div>}
      {!busy && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-500">
          아직 등록된 매크로가 없습니다. <b>+ 나만의 매크로 등록</b>으로 첫 주자가 되어보세요.
        </div>
      )}

      <div className="space-y-3">
        {items.map((e, idx) => {
          const r = ret(e);
          return (
            <div key={e.id} className="rounded-2xl bg-surface border border-slate-200 p-4 flex items-center gap-4 flex-wrap">
              <div className="w-8 text-center text-lg font-bold text-slate-500">{idx + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {e.crown && <span title="인기 셀러 (판매·좋아요 상위)">👑</span>}
                  <span className="font-semibold text-slate-900 truncate">{e.username || e.nickname}</span>
                  {(e.is_owner || e.is_mine) && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-300">내 것</span>}
                  {e.macro?.leverage > 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-300 font-bold" title="고위험 레버리지 전략">
                      ⚠️ {e.macro.leverage}배
                    </span>
                  )}
                  <span className="text-xs text-slate-500">· 오늘 {e.created_kst} 등록</span>
                </div>
                {e.locked ? (
                  <div className="text-sm text-slate-400 truncate">🔒 잠김 — 언락하면 전략·매크로가 공개돼요</div>
                ) : (
                  <div className="text-sm text-slate-700 truncate">{e.human_summary}</div>
                )}
              </div>

              <div className={"w-24 text-right text-xl font-bold tabular-nums " + r.cls}>{r.text}</div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => vote(e.id, 1)}
                  className={"px-2 py-1 rounded-lg text-sm " + (e.my_vote === 1 ? "bg-green-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700")}
                  title="좋아요"
                >
                  👍 {e.likes}
                </button>
                <button
                  onClick={() => vote(e.id, -1)}
                  className={"px-2 py-1 rounded-lg text-sm " + (e.my_vote === -1 ? "bg-danger text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700")}
                  title="싫어요"
                >
                  👎 {e.dislikes}
                </button>
                {e.locked ? (
                  <button
                    onClick={() => unlock(e)}
                    disabled={unlocking === e.id}
                    className="px-3 py-1 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-white"
                    title="포인트를 써서 매크로 공개+복사 (창작자에게 70% 적립)"
                  >
                    {unlocking === e.id ? "여는 중…" : `🔓 ${e.unlock_price}P`}
                  </button>
                ) : (
                  <button
                    onClick={() => copyToBuilder(e)}
                    className="px-2 py-1 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
                    title="이 매크로를 빌더로 복사"
                  >
                    📋 복사
                  </button>
                )}
                {e.is_mine && !e.for_sale && (
                  <button
                    onClick={() => setModal({ edit: e })}
                    className="px-2 py-1 rounded-lg text-sm bg-slate-100 hover:bg-slate-200 text-slate-700"
                    title="비밀번호 확인 후 수정"
                  >
                    ✏ 수정
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <RegisterMacroModal
          key={modal.edit ? `edit-${modal.edit.id}` : "new"}
          open={true}
          editEntry={modal.edit || null}
          onClose={() => setModal(false)}
          onDone={() => load()}
        />
      )}

      <ChatBox />
    </div>
  );
}
