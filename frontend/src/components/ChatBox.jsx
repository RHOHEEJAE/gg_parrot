import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { getNickname, setNickname } from "../lib/user.js";

// Leaderboard chat: daily (KST) message board. Polls every ~3s. React escapes
// message text on render, so stored raw text can't inject HTML.
const POLL_MS = 3000;

export default function ChatBox() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState(getNickname());
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);
  const timer = useRef(null);

  async function load() {
    try {
      const d = await api.chatList();
      setItems(d.items || []);
    } catch (_) {}
  }

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, []);

  useEffect(() => {
    // keep scrolled to newest
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [items]);

  async function send(e) {
    e.preventDefault();
    setError("");
    if (!text.trim()) return;
    if (!name.trim()) return setError("아이디를 입력하세요.");
    setBusy(true);
    try {
      setNickname(name);
      await api.chatPost(name.trim(), text.trim());
      setText("");
      load();
    } catch (err) {
      setError(String(err.message || err)); // 429 rate limit surfaces here
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-2xl bg-surface border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold">💬 리더보드 채팅</h3>
        <span className="text-[11px] text-slate-500">매일 KST 00:00 초기화</span>
      </div>

      <div ref={listRef} className="h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-100 p-3 space-y-1.5">
        {items.length === 0 && <div className="text-slate-500 text-sm text-center py-8">아직 메시지가 없습니다. 첫 채팅을 남겨보세요.</div>}
        {items.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="text-slate-500 text-xs mr-2 tabular-nums">{m.created_kst}</span>
            <span className="font-semibold text-indigo-700 mr-1.5">{m.username}</span>
            <span className="text-slate-800 break-words">{m.text}</span>
          </div>
        ))}
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={24}
          placeholder="아이디"
          className="w-28 rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          placeholder="메시지 입력 (최대 300자)"
          className="flex-1 rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2 text-sm font-semibold text-white">
          전송
        </button>
      </form>
      {error && <div className="mt-2 text-xs text-amber-600">{error}</div>}
      <p className="mt-2 text-[11px] text-slate-500">
        채팅 내용은 투자 조언이 아니며, 매매 판단과 책임은 본인에게 있습니다.
      </p>
    </div>
  );
}
