import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { setAuth } from "../lib/auth.js";
import {
  clearAuthReturn,
  recallAuthReturn,
  rememberAuthReturn,
  safeLocalPath,
} from "../lib/returnPath.js";

// §6 text-field. 라벨은 14/600, 도움말은 14/500 — 둘 다 '작은 글씨' 단계(§4).
const inputCls = "field";
const labelCls = "block t-small font-semibold text-slate-700 mb-2";

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedNext = safeLocalPath(params.get("next") || "");
  const next = requestedNext || recallAuthReturn("/leaderboard");
  const [mode, setMode] = useState(params.get("mode") === "signup" ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isSignup = mode === "signup";

  useEffect(() => {
    rememberAuthReturn(next);
  }, [next]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = isSignup
        ? await api.signup(email.trim(), username.trim(), password)
        : await api.login(email.trim(), password);
      setAuth(data.token, data.user);
      clearAuthReturn();
      navigate(next, { replace: true });
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto">
      {/* 폼은 상자를 유지하는 §1-3 예외 — 화면 전체가 하나의 입력 흐름이다. */}
      <div className="form-surface border border-slate-200 p-6">
        <div className="text-2xl mb-1" aria-hidden>🦜</div>
        <h1 className="t-h2 text-slate-900 mb-1">{isSignup ? "회원가입" : "로그인"}</h1>
        <p className="t-small text-slate-700 mb-6">
          {isSignup
            ? "가입하면 스타터 포인트를 드려요. 리더보드 매크로를 열어보거나 내 전략으로 포인트를 벌 수 있어요."
            : "다시 오신 걸 환영해요."}
        </p>

        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className={labelCls}>이메일</span>
            <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" required />
          </label>
          {isSignup && (
            <label className="block">
              <span className={labelCls}>아이디 (공개 표시용)</span>
              <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="2~20자 · 한글/영문/숫자/_" autoComplete="username" required />
            </label>
          )}
          <label className="block">
            <span className={labelCls}>비밀번호</span>
            <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "8자 이상" : ""} autoComplete={isSignup ? "new-password" : "current-password"} required />
          </label>

          {error && <div className="t-small text-red-600" role="alert">{error}</div>}

          <button type="submit" disabled={busy} className="btn btn-l btn-primary w-full">
            {busy ? "처리 중…" : isSignup ? "가입하기" : "로그인"}
          </button>
        </form>

        {!isSignup && (
          <div className="mt-4 text-center">
            <button className="t-caption text-slate-500 hover:text-slate-900 underline underline-offset-4"
              onClick={() => navigate(`/forgot?next=${encodeURIComponent(next)}`)}>
              비밀번호를 잊으셨나요?
            </button>
          </div>
        )}

        <div className="mt-4 t-small text-slate-700 text-center">
          {isSignup ? "이미 계정이 있나요?" : "계정이 없나요?"}{" "}
          <button
            className="font-bold text-slate-900 underline underline-offset-4"
            onClick={() => { setError(""); setMode(isSignup ? "login" : "signup"); }}
          >
            {isSignup ? "로그인" : "회원가입"}
          </button>
        </div>
      </div>
      <p className="mt-4 t-caption text-slate-500 text-center">
        포인트는 서비스 안에서만 쓰는 가상 재화이고, 본 서비스는 실거래·투자 자문이 아니에요.
      </p>
    </div>
  );
}
