import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { recallAuthReturn, rememberAuthReturn, safeLocalPath } from "../lib/returnPath.js";

const inputCls = "field";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeLocalPath(params.get("next") || "") || recallAuthReturn("/leaderboard");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null); // {message, email_enabled}
  const [error, setError] = useState("");

  useEffect(() => {
    rememberAuthReturn(next);
  }, [next]);

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
      <div className="form-surface border border-slate-200 p-6">
        <h1 className="t-h2 text-slate-900 mb-1">비밀번호 찾기</h1>
        <p className="t-small text-slate-700 mb-6">가입한 이메일로 재설정 링크를 보내드려요.</p>

        {done ? (
          <div className="space-y-4">
            <div className="notice-good t-small text-slate-700">{done.message}</div>
            {done.email_enabled === false && (
              <div className="notice-warn t-caption text-slate-700">
                <b className="text-slate-900">주의 · </b>지금은 이메일 발송이 설정돼 있지 않아 실제 메일은 가지 않아요. (관리자 설정 필요)
              </div>
            )}
            <button onClick={() => navigate(`/login?next=${encodeURIComponent(next)}`)} className="btn btn-l btn-primary w-full">
              로그인으로
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="block t-small font-semibold text-slate-700 mb-2">이메일</span>
              <input className={inputCls} type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            {error && <div className="t-small text-red-600" role="alert">{error}</div>}
            <button type="submit" disabled={busy} className="btn btn-l btn-primary w-full">
              {busy ? "보내는 중…" : "재설정 링크 보내기"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
