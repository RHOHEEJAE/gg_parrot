import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Builder from "./Builder.jsx";
import { api } from "../api.js";
import { buildMacro, defaultForm, macroToForm, validate } from "../lib/macro.js";
import { getUserId } from "../lib/user.js";
import { useAuth } from "../lib/auth.js";

// Popup builder.
//  * register (default): requires login — the entry is owned by the account.
//  * edit (editEntry set): account-owned entries authorize via the logged-in
//    owner (no password); legacy anonymous entries verify the edit password.
// Mount with a `key` so switching mode/entry resets the internal form state.
export default function RegisterMacroModal({ open, onClose, onDone, editEntry = null, initialMacro = null }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = !!editEntry;
  const [form, setForm] = useState(() => {
    if (isEdit && editEntry.macro) return macroToForm(editEntry.macro);
    if (initialMacro) return macroToForm(initialMacro);
    return defaultForm();
  });
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("live");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const needsLogin = !isEdit && !user;                    // register requires an account
  const accountEdit = isEdit && !!editEntry.is_owner;      // editing my own account entry (no password)
  const needsPassword = isEdit && !accountEdit;            // legacy anonymous edit
  const asAccount = !isEdit && !!user;                     // account register

  const valErr = validate(form);
  const inputCls =
    "w-full rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";

  async function save() {
    setError("");
    if (needsLogin) return setError("로그인 후 등록할 수 있어요.");
    if (needsPassword && !password) return setError("비밀번호를 입력하세요.");
    if (valErr) return setError(valErr);
    setBusy(true);
    try {
      const macro = buildMacro(form);
      if (isEdit) {
        const d = await api.leaderboardEdit(editEntry.id, macro, accountEdit ? "" : password, mode);
        onDone?.(d.entry);
      } else {
        // Logged in -> token attached; backend uses the account as owner.
        const d = await api.leaderboardRegister(macro, user.username, "", getUserId(), mode);
        onDone?.(d.entry);
      }
      onClose();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  const modeSelect = (
    <label className="block">
      <span className="text-sm text-slate-700 mb-1 block">페이퍼 모드</span>
      <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value)}>
        <option value="live">실시간(live)</option>
        <option value="replay">데모 리플레이</option>
      </select>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4 bg-black/60 overflow-y-auto">
      <div className="w-full max-w-2xl my-4 sm:my-8 rounded-2xl bg-surface border border-slate-300 shadow-2xl">
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 sticky top-0 bg-surface rounded-t-2xl z-10">
          <h3 className="text-lg font-semibold">{isEdit ? "매크로 수정" : "나만의 매크로 등록"}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-xl leading-none" aria-label="닫기">✕</button>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-5">
          {needsLogin ? (
            <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-4 text-center">
              <div className="text-sm text-indigo-900 mb-3">
                매크로 등록은 <b>로그인한 계정</b>으로만 할 수 있어요. 내 계정으로 등록하면 남이 언락할 때 포인트가 적립돼요.
              </div>
              <button
                onClick={() => navigate("/login")}
                className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-sm font-bold text-white"
              >
                로그인 / 회원가입
              </button>
            </div>
          ) : accountEdit || asAccount ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
              <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-sm text-indigo-900">
                👤 <b>@{user.username}</b> 계정{accountEdit ? "의 매크로를 수정해요." : "으로 등록돼요. 남이 언락하면 포인트 70% 적립."}
              </div>
              {modeSelect}
            </div>
          ) : (
            // legacy anonymous edit — password required
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <label className="block">
                  <span className="text-sm text-slate-700 mb-1 block">아이디</span>
                  <input className={inputCls + " opacity-60"} value={editEntry.username || ""} disabled />
                </label>
                <label className="block">
                  <span className="text-sm text-slate-700 mb-1 block">비밀번호</span>
                  <input className={inputCls} type="password" value={password}
                    placeholder="수정하려면 비밀번호" onChange={(e) => setPassword(e.target.value)} />
                </label>
                {modeSelect}
              </div>
              <p className="text-xs text-amber-700">⚠ 예전 방식(비밀번호)으로 등록된 엔트리예요.</p>
            </>
          )}

          {!needsLogin && <Builder form={form} setForm={setForm} />}

          {valErr && !needsLogin && <div className="text-sm text-amber-700">{valErr}</div>}
          {error && <div className="text-sm text-red-600">오류: {error}</div>}
          {!needsLogin && (
            <p className="text-xs text-slate-500">
              저장하면 이 매크로로 <b>모의(페이퍼) 트레이딩</b>이 시작되고 오늘의 리더보드에 반영됩니다. 실거래가 아니며, 현물 시세가 없는 종목은 등록되지 않습니다.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-200 sticky bottom-0 bg-surface rounded-b-2xl">
          <button onClick={onClose} disabled={busy} className="rounded-lg bg-slate-200 hover:bg-slate-300 px-5 py-2.5 font-semibold disabled:opacity-40">
            {needsLogin ? "닫기" : "취소"}
          </button>
          {!needsLogin && (
            <button onClick={save} disabled={busy || !!valErr} className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2.5 font-semibold disabled:opacity-40 text-white">
              {busy ? "처리 중…" : isEdit ? "수정 저장" : "저장 & 등록"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
