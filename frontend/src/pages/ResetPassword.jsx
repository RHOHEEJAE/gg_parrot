import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";

const inputCls =
  "w-full rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-slate-900 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <div className="rounded-2xl bg-surface border border-slate-200 p-6">
        <h1 className="text-xl font-bold mb-1">비밀번호 재설정</h1>
        {!token ? (
          <p className="text-sm text-red-600 mt-2">재설정 토큰이 없어요. 메일의 링크로 다시 들어와 주세요.</p>
        ) : done ? (
          <div className="space-y-3 mt-3">
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
              비밀번호가 변경됐어요. 새 비밀번호로 로그인해 주세요.
            </div>
            <button onClick={() => navigate("/login")}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white">
              로그인
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 mt-3">
            <label className="block">
              <span className="text-sm text-slate-700">새 비밀번호</span>
              <input className={inputCls} type="password" value={password} placeholder="8자 이상"
                onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </label>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2.5 text-sm font-semibold text-white">
              {busy ? "변경 중…" : "비밀번호 변경"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
