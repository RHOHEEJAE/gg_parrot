import { useEffect } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import Studio from "./pages/Studio.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import Auth from "./pages/Auth.jsx";
import MyPage from "./pages/MyPage.jsx";
import Guide from "./pages/Guide.jsx";
import News from "./pages/News.jsx";
import Board from "./pages/Board.jsx";
import BoardPost from "./pages/BoardPost.jsx";
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

const NAV_LINKS = [
  { to: "/", end: true, label: "오늘의 리더보드" },
  { to: "/builder", label: "빌더" },
  { to: "/news", label: "코인동향" },
  { to: "/board", label: "게시판" },
  { to: "/guide", label: "가이드" },
];

// The five Korean menu labels plus the account controls can't share one row on a
// phone, so below `md` the menu drops to its own horizontally-scrollable strip
// and only the logo + account controls stay on the top row.
function Nav() {
  const cls = ({ isActive }) =>
    "px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap " +
    (isActive ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:text-slate-900");
  const links = NAV_LINKS.map((l) => (
    <NavLink key={l.to} to={l.to} end={l.end} className={cls}>
      {l.label}
    </NavLink>
  ));
  return (
    <header className="border-b border-slate-200 sticky top-0 bg-surface/80 backdrop-blur z-20">
      <div className="max-w-6xl mx-auto px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <NavLink to="/" className="text-base font-bold shrink-0">
              🦜 GGparrot
            </NavLink>
            <nav className="hidden md:flex gap-1">{links}</nav>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <SimBadge className="hidden lg:inline-flex" />
            <AuthNav />
            <ThemeToggle />
          </div>
        </div>
        {/* mobile menu — bleeds to the screen edges so the last item can scroll in */}
        <nav className="md:hidden -mx-4 mt-1 px-2 flex gap-1 overflow-x-auto no-scrollbar">
          {links}
        </nav>
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
          className="px-2 sm:px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap text-slate-600 hover:text-slate-900">
          로그인
        </button>
        <button onClick={() => navigate("/login?mode=signup")}
          className="px-2.5 sm:px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap bg-indigo-600 hover:bg-indigo-500 text-white">
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
        className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-300 px-2 sm:px-2.5 py-1 text-xs font-bold whitespace-nowrap text-amber-800 hover:bg-amber-100"
        title="마이페이지 · 보유 포인트">
        🪙 {(user.points_balance ?? 0).toLocaleString()}P
      </button>
      <button onClick={() => { clearAuth(); navigate("/"); }}
        className="px-1.5 sm:px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap text-slate-500 hover:text-slate-900">
        로그아웃
      </button>
    </div>
  );
}

// 로그인 게이트 — 빌더 등 로그인 후 이용 화면을 감싼다.
function RequireAuth({ children }) {
  const { token } = useAuth();
  const navigate = useNavigate();
  if (token) return children;
  return (
    <div className="max-w-md mx-auto mt-10 rounded-2xl bg-surface border border-slate-200 p-8 text-center">
      <div className="text-4xl mb-3">🔒</div>
      <h2 className="text-lg font-bold text-slate-900">로그인 후 이용할 수 있는 서비스입니다</h2>
      <p className="mt-2 text-sm text-slate-500">
        매크로 빌더는 로그인한 회원만 사용할 수 있어요. 로그인하거나 회원가입 후 이용해 주세요.
      </p>
      <div className="mt-5 flex items-center justify-center gap-2">
        <button
          onClick={() => navigate("/login")}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-5 py-2 text-sm font-bold text-white"
        >
          로그인
        </button>
        <button
          onClick={() => navigate("/login?mode=signup")}
          className="rounded-lg bg-slate-200 hover:bg-slate-300 px-5 py-2 text-sm font-semibold text-slate-700"
        >
          회원가입
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen pb-16">
      <Nav />
      <KimchiBanner />
      <HangangTempBanner />
      {/* [차후 도입] <WhaleBanner /> */}
      <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
        <Routes>
          <Route path="/" element={<Leaderboard />} />
          <Route path="/builder" element={<RequireAuth><Studio /></RequireAuth>} />
          <Route path="/s/:slug" element={<RequireAuth><Studio /></RequireAuth>} />
          <Route path="/mypage" element={<MyPage />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/news" element={<News />} />
          <Route path="/board" element={<Board />} />
          <Route path="/board/:id" element={<BoardPost />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/forgot" element={<ForgotPassword />} />
          <Route path="/reset" element={<ResetPassword />} />
          <Route path="/leaderboard" element={<Navigate to="/" replace />} />
          <Route path="/gallery" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="max-w-6xl mx-auto px-4 pb-6 pt-2 sm:py-8 text-xs text-slate-500">
        본 서비스는 실거래/자동매매를 하지 않습니다. 모든 수치는 과거 데이터 시뮬레이션 결과입니다.
      </footer>
      <HotCoinsMarquee />
    </div>
  );
}
