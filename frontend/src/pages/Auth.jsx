import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { setAuth } from "../lib/auth.js";

const inputCls =
  "w-full rounded-lg bg-slate-100 border border-slate-300 px-3 py-2 text-slate-900 " +
  "focus:outline-none focus:ring-2 focus:ring-indigo-500";

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = isSignup
        ? await api.signup(email.trim(), username.trim(), password)
        : await api.login(email.trim(), password);
      setAuth(data.token, data.user);
      navigate("/leaderboard");
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      <div className="rounded-2xl bg-surface border border-slate-200 p-5 sm:p-6">
        <div className="text-2xl mb-1">🦜</div>
        <h1 className="text-xl font-bold mb-1">{isSignup ? "회원가입" : "로그인"}</h1>
        <p className="text-sm text-slate-500 mb-5">
          {isSignup
            ? "가입하면 스타터 포인트를 드려요. 리더보드 매크로를 열어보거나 내 전략으로 포인트를 벌 수 있어요."
            : "다시 오신 걸 환영해요."}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-sm text-slate-700">이메일</span>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" required />
          </label>
          {isSignup && (
            <label className="block">
              <span className="text-sm text-slate-700">아이디 (공개 표시용)</span>
              <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="2~20자 · 한글/영문/숫자/_" autoComplete="username" required />
            </label>
          )}
          <label className="block">
            <span className="text-sm text-slate-700">비밀번호</span>
            <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "8자 이상" : ""} autoComplete={isSignup ? "new-password" : "current-password"} required />
          </label>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2.5 text-sm font-semibold text-white">
            {busy ? "처리 중…" : isSignup ? "가입하기" : "로그인"}
          </button>
        </form>

        {!isSignup && (
          <div className="mt-3 text-center">
            <button className="text-xs text-slate-500 hover:text-indigo-600 underline"
              onClick={() => navigate("/forgot")}>
              비밀번호를 잊으셨나요?
            </button>
          </div>
        )}

        <div className="mt-4 text-sm text-slate-500 text-center">
          {isSignup ? "이미 계정이 있나요?" : "계정이 없나요?"}{" "}
          <button
            className="text-indigo-600 font-semibold underline"
            onClick={() => { setError(""); setMode(isSignup ? "login" : "signup"); }}
          >
            {isSignup ? "로그인" : "회원가입"}
          </button>
        </div>
      </div>
      <p className="mt-4 text-xs text-slate-400 text-center">
        포인트는 서비스 내 가상 재화이며, 본 서비스는 실거래/투자 자문이 아닙니다.
      </p>
    </div>
  );
}
