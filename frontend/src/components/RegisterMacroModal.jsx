import { useState } from "react";
import Builder from "./Builder.jsx";
import { api } from "../api.js";
import { buildMacro, defaultForm, macroToForm, validate } from "../lib/macro.js";
import { getNickname, getUserId, setNickname } from "../lib/user.js";
import { useAuth } from "../lib/auth.js";

// Popup builder. Two modes:
//  * register (default): pick a macro + 아이디/비밀번호 -> starts a paper session
//    and adds it to the board. `initialMacro` prefills the builder (e.g. the
//    macro the user just tested in the Studio) so they can register it directly.
//  * edit (editEntry set): prefilled with the entry's macro; the password is
//    verified server-side before the edit is applied.
// Mount with a `key` so switching mode/entry resets the internal form state.
export default function RegisterMacroModal({ open, onClose, onDone, editEntry = null, initialMacro = null }) {
  const isEdit = !!editEntry;
  const [form, setForm] = useState(() => {
    if (isEdit && editEntry.macro) return macroToForm(editEntry.macro);
    if (initialMacro) return macroToForm(initialMacro);
    return defaultForm();
  });
  const { user } = useAuth();
  // Registering while logged in -> the entry is owned by the account (earns the
  // creator share). No display id / edit password needed then.
  const asAccount = !isEdit && !!user;
  const [username, setUser] = useState(isEdit ? editEntry.username || "" : getNickname());
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("live");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;
  const valErr = validate(form);
  const inputCls =
    "w-full rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";

  async function save() {
    setError("");
    if (!asAccount) {
      if (!isEdit && !username.trim()) return setError("아이디를 입력하세요.");
      if (!password) return setError("비밀번호를 입력하세요.");
    }
    if (valErr) return setError(valErr);
    setBusy(true);
    try {
      const macro = buildMacro(form);
      if (isEdit) {
        const d = await api.leaderboardEdit(editEntry.id, macro, password, mode);
        onDone?.(d.entry);
      } else if (asAccount) {
        // Token is attached automatically -> backend uses the account as owner;
        // the username/password args are ignored server-side.
        const d = await api.leaderboardRegister(macro, user.username, "", getUserId(), mode);
        onDone?.(d.entry);
      } else {
        setNickname(username);
        const d = await api.leaderboardRegister(macro, username.trim(), password, getUserId(), mode);
        onDone?.(d.entry);
      }
      onClose();
    } catch (e) {
      // 403 (wrong password), 422 (no spot data), 429 (rate limit) surface here.
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 overflow-y-auto">
      <div className="w-full max-w-2xl my-8 rounded-2xl bg-surface border border-slate-300 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-surface rounded-t-2xl z-10">
          <h3 className="text-lg font-semibold">{isEdit ? "매크로 수정" : "나만의 매크로 등록"}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-xl leading-none" aria-label="닫기">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {asAccount ? (
            <div className="grid grid-cols-2 gap-4 items-end">
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm text-indigo-800">
                👤 <b>@{user.username}</b> 계정으로 등록돼요. 다른 사람이 언락하면 <b>포인트 70%</b>가 적립돼요.
              </div>
              <label className="block">
                <span className="text-sm text-slate-700 mb-1 block">페이퍼 모드</span>
                <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="live">실시간(live)</option>
                  <option value="replay">데모 리플레이</option>
                </select>
              </label>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <label className="block">
                  <span className="text-sm text-slate-700 mb-1 block">아이디</span>
                  <input
                    className={inputCls + (isEdit ? " opacity-60" : "")}
                    value={username}
                    maxLength={24}
                    disabled={isEdit}
                    placeholder="표시용 아이디"
                    onChange={(e) => setUser(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700 mb-1 block">비밀번호</span>
                  <input
                    className={inputCls}
                    type="password"
                    value={password}
                    placeholder={isEdit ? "수정하려면 비밀번호" : "수정용 비밀번호"}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700 mb-1 block">페이퍼 모드</span>
                  <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="live">실시간(live)</option>
                    <option value="replay">데모 리플레이</option>
                  </select>
                </label>
              </div>
              {!isEdit && (
                <p className="text-xs text-slate-500">
                  💡 <b>로그인</b>하면 계정으로 등록되고, 남이 내 매크로를 언락할 때 포인트를 벌 수 있어요.
                </p>
              )}
              <p className="text-xs text-amber-700">
                ⚠ 이 비밀번호는 엔트리 수정용 임시 비밀번호입니다. <b>다른 서비스와 다른 비밀번호</b>를 사용하세요. (평문 저장 안 함)
              </p>
            </>
          )}

          <Builder form={form} setForm={setForm} />

          {valErr && <div className="text-sm text-amber-700">{valErr}</div>}
          {error && <div className="text-sm text-red-600">오류: {error}</div>}
          <p className="text-xs text-slate-500">
            저장하면 이 매크로로 <b>모의(페이퍼) 트레이딩</b>이 시작되고 오늘의 리더보드에 반영됩니다. 실거래가 아니며, 현물 시세가 없는 종목은 등록되지 않습니다.
          </p>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 sticky bottom-0 bg-surface rounded-b-2xl">
          <button onClick={onClose} disabled={busy} className="rounded-lg bg-slate-200 hover:bg-slate-300 px-5 py-2.5 font-semibold disabled:opacity-40">
            취소
          </button>
          <button onClick={save} disabled={busy || !!valErr} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 font-semibold disabled:opacity-40 text-white">
            {busy ? "처리 중…" : isEdit ? "수정 저장" : "저장 & 등록"}
          </button>
        </div>
      </div>
    </div>
  );
}
