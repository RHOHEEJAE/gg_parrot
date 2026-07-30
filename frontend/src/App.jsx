import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Studio from "./pages/Studio.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import Auth from "./pages/Auth.jsx";
import MyPage from "./pages/MyPage.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import { api } from "./api.js";
import { useAuth, clearAuth, updateAuthUser } from "./lib/auth.js";
import SimBadge from "./components/SimBadge.jsx";
import KimchiBanner from "./components/KimchiBanner.jsx";
import HangangTempBanner from "./components/HangangTempBanner.jsx";
// [차후 도입] 고래 동향 배너 — 거래소/컨트랙트 지갑 노이즈 정리 후 켤 예정.
// 컴포넌트와 백엔드(app/whales.py)는 그대로 두고 마운트만 꺼둡니다.
// import WhaleBanner from "./components/WhaleBanner.jsx";
import HotCoinsMarquee from "./components/HotCoinsMarquee.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";

function Nav() {
  const cls = ({ isActive }) =>
    "px-3 py-2 rounded-lg text-sm font-medium " +
    (isActive ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:text-slate-900");
  return (
    <header className="border-b border-slate-200 sticky top-0 bg-surface/80 backdrop-blur z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <NavLink to="/" className="text-base font-bold">
            🦜 GGparrot
          </NavLink>
          <nav className="flex gap-1">
            <NavLink to="/" end className={cls}>
              오늘의 리더보드
            </NavLink>
            <NavLink to="/builder" className={cls}>
              빌더
            </NavLink>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <SimBadge className="hidden sm:inline-flex" />
          <AuthNav />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function AuthNav() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  // Refresh the points balance from the server when logged in (keeps the header
  // in sync after unlocks/earnings made in other tabs).
  useEffect(() => {
    if (!token) return;
    api.me().then((d) => updateAuthUser(d.user)).catch(() => {});
  }, [token]);

  if (!token || !user) {
    return (
      <div className="flex items-center gap-1">
        <button onClick={() => navigate("/login")}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-900">
          로그인
        </button>
        <button onClick={() => navigate("/login?mode=signup")}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white">
          회원가입
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => navigate("/mypage")}
        className="hidden sm:inline text-sm text-slate-700 font-medium truncate max-w-[10rem] hover:text-indigo-600"
        title="마이페이지">
        👤 {user.username}
      </button>
      <button onClick={() => navigate("/mypage")}
        className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-300 px-2.5 py-1 text-xs font-bold text-amber-800 hover:bg-amber-100"
        title="마이페이지 · 보유 포인트">
        🪙 {(user.points_balance ?? 0).toLocaleString()}P
      </button>
      <button onClick={() => { clearAuth(); navigate("/"); }}
        className="px-2 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900">
        로그아웃
      </button>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen pb-12">
      <Nav />
      <KimchiBanner />
      <HangangTempBanner />
      {/* [차후 도입] <WhaleBanner /> */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Leaderboard />} />
          <Route path="/builder" element={<Studio />} />
          <Route path="/s/:slug" element={<Studio />} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/leaderboard" element={<Navigate to="/" replace />} />
          <Route path="/gallery" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="max-w-6xl mx-auto px-4 py-8 text-xs text-slate-500">
        본 서비스는 실거래/자동매매를 하지 않습니다. 모든 수치는 과거 데이터 시뮬레이션 결과입니다.
      </footer>
      <HotCoinsMarquee />
    </div>
  );
}
