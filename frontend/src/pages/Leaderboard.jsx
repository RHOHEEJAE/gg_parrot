import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import SimBadge from "../components/SimBadge.jsx";
import RegisterMacroModal from "../components/RegisterMacroModal.jsx";
import ChatBox from "../components/ChatBox.jsx";
import { api } from "../api.js";
import { getUserId } from "../lib/user.js";

const pad = (n) => String(n).padStart(2, "0");
const fmtCountdown = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

function ret(e) {
  if (e.return_pct == null) return { text: "집계중…", cls: "text-slate-500" };
  const up = e.return_pct >= 0;
  return { text: `${up ? "+" : ""}${e.return_pct.toFixed(2)}%`, cls: up ? "text-green-400" : "text-red-400" };
}

export default function Leaderboard() {
  const uid = getUserId();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
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
    navigate("/", { state: { macro: entry.macro } });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-semibold">🏆 오늘의 리더보드</h2>
        <SimBadge />
      </div>

      {/* countdown + register */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6 rounded-2xl bg-slate-900 border border-slate-800 px-5 py-4">
        <div className="text-sm text-slate-300">
          리더보드 초기화까지{" "}
          <span className="font-bold tabular-nums text-amber-300">{fmtCountdown(remain)}</span>{" "}
          <span className="text-slate-500">남음 (매일 KST 00:00 초기화)</span>
        </div>
        <button
          onClick={() => setModal({})}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold"
        >
          + 나만의 매크로 등록
        </button>
      </div>

      <p className="text-sm text-slate-500 mb-4">
        실시간 <b>모의(페이퍼)</b> 수익률과 좋아요로 겨루는 오늘의 보드입니다. 좋아요·수익률은 참고용이며 매수 추천/신호가 아닙니다.
      </p>

      {busy && <div className="text-slate-500">불러오는 중…</div>}
      {error && <div className="text-red-400">오류: {error}</div>}
      {!busy && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-800 p-10 text-center text-slate-500">
          아직 등록된 매크로가 없습니다. <b>+ 나만의 매크로 등록</b>으로 첫 주자가 되어보세요.
        </div>
      )}

      <div className="space-y-3">
        {items.map((e, idx) => {
          const r = ret(e);
          return (
            <div key={e.id} className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex items-center gap-4 flex-wrap">
              <div className="w-8 text-center text-lg font-bold text-slate-500">{idx + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-100 truncate">{e.username || e.nickname}</span>
                  {e.is_mine && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800">나</span>}
                  <span className="text-xs text-slate-500">· 오늘 {e.created_kst} 등록</span>
                </div>
                <div className="text-sm text-slate-300 truncate">{e.human_summary}</div>
              </div>

              <div className={"w-24 text-right text-xl font-bold tabular-nums " + r.cls}>{r.text}</div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => vote(e.id, 1)}
                  className={"px-2 py-1 rounded-lg text-sm " + (e.my_vote === 1 ? "bg-green-600 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-300")}
                  title="좋아요"
                >
                  👍 {e.likes}
                </button>
                <button
                  onClick={() => vote(e.id, -1)}
                  className={"px-2 py-1 rounded-lg text-sm " + (e.my_vote === -1 ? "bg-red-600 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-300")}
                  title="싫어요"
                >
                  👎 {e.dislikes}
                </button>
                <button
                  onClick={() => copyToBuilder(e)}
                  className="px-2 py-1 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300"
                  title="이 매크로를 빌더로 복사"
                >
                  📋 복사
                </button>
                <button
                  onClick={() => setModal({ edit: e })}
                  className="px-2 py-1 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-300"
                  title="비밀번호 확인 후 수정"
                >
                  ✏ 수정
                </button>
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
