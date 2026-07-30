import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

const inputCls =
  "w-full rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-slate-900 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // {message, email_enabled}
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setDone(await api.forgotPassword(email.trim()));
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <div className="rounded-2xl bg-surface border border-slate-200 p-6">
        <h1 className="text-xl font-bold mb-1">비밀번호 찾기</h1>
        <p className="text-sm text-slate-500 mb-5">가입한 이메일로 재설정 링크를 보내드려요.</p>

        {done ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
              {done.message}
            </div>
            {done.email_enabled === false && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                ⚠ 현재 이메일 발송이 설정되지 않아 실제 메일은 가지 않아요. (관리자 설정 필요)
              </div>
            )}
            <button onClick={() => navigate("/login")}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white">
              로그인으로
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input className={inputCls} type="email" value={email} placeholder="이메일"
              onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2.5 text-sm font-semibold text-white">
              {busy ? "보내는 중…" : "재설정 링크 보내기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
