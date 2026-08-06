import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { recallAuthReturn, safeLocalPath } from "../lib/returnPath.js";

const inputCls = "field";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const next = safeLocalPath(params.get("next") || "") || recallAuthReturn("/leaderboard");
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
      <div className="form-surface border border-slate-200 p-6">
        <h1 className="t-h2 text-slate-900 mb-1">비밀번호 재설정</h1>
        {!token ? (
          <p className="t-small text-red-600 mt-2">재설정 토큰이 없어요. 메일의 링크로 다시 들어와 주세요.</p>
        ) : done ? (
          <div className="space-y-4 mt-4">
            <div className="notice-good t-small text-slate-700">
              비밀번호를 바꿨어요. 새 비밀번호로 로그인해 주세요.
            </div>
            <button onClick={() => navigate(`/login?next=${encodeURIComponent(next)}`)} className="btn btn-l btn-primary w-full">
              로그인
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 mt-4">
            <label className="block">
              <span className="block t-small font-semibold text-slate-700 mb-2">새 비밀번호</span>
              <input className={inputCls} type="password" value={password} placeholder="8자 이상"
                onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
            </label>
            {error && <div className="t-small text-red-600" role="alert">{error}</div>}
            <button type="submit" disabled={busy} className="btn btn-l btn-primary w-full">
              {busy ? "변경 중…" : "비밀번호 변경"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
