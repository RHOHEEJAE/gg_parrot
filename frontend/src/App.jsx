import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Studio from "./pages/Studio.jsx";
import Leaderboard from "./pages/Leaderboard.jsx";
import SimBadge from "./components/SimBadge.jsx";
import KimchiBanner from "./components/KimchiBanner.jsx";
import HangangTempBanner from "./components/HangangTempBanner.jsx";
import WhaleBanner from "./components/WhaleBanner.jsx";
import HotCoinsMarquee from "./components/HotCoinsMarquee.jsx";

function Nav() {
  const cls = ({ isActive }) =>
    "px-3 py-2 rounded-lg text-sm font-medium " +
    (isActive ? "bg-slate-200 text-slate-900" : "text-slate-500 hover:text-slate-900");
  return (
    <header className="border-b border-slate-200 sticky top-0 bg-white/80 backdrop-blur z-10">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <NavLink to="/" className="text-base font-bold">
            🦜 GGparrot
          </NavLink>
          <nav className="flex gap-1">
            <NavLink to="/" end={false} className={cls}>
              빌더
            </NavLink>
            <NavLink to="/leaderboard" className={cls}>
              오늘의 리더보드
            </NavLink>
          </nav>
        </div>
        <SimBadge className="hidden sm:inline-flex" />
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen pb-12">
      <Nav />
      <KimchiBanner />
      <HangangTempBanner />
      <WhaleBanner />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Routes>
          <Route path="/" element={<Studio />} />
          <Route path="/s/:slug" element={<Studio />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/gallery" element={<Navigate to="/leaderboard" replace />} />
        </Routes>
      </main>
      <footer className="max-w-6xl mx-auto px-4 py-8 text-xs text-slate-500">
        본 서비스는 실거래/자동매매를 하지 않습니다. 모든 수치는 과거 데이터 시뮬레이션 결과입니다.
      </footer>
      <HotCoinsMarquee />
    </div>
  );
}
