// Thin API client. Relative URLs work in dev (Vite proxy) and in prod
// (FastAPI serves the built SPA and the /api routes from one origin).
import { getToken } from "./lib/auth.js";

const BASE = "";

async function req(path, opts = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  // account auth
  signup: (email, username, password) =>
    req("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, username, password }) }),
  login: (email, password) =>
    req("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => req("/api/auth/me"),
  myDashboard: () => req("/api/me/dashboard"),
  forgotPassword: (email) =>
    req("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token, password) =>
    req("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) }),

  createMacro: (macro) => req("/api/macros", { method: "POST", body: JSON.stringify(macro) }),
  getMacro: (slug) => req(`/api/macros/${slug}`),
  backtest: (macro, periodOverride) =>
    req("/api/backtest", {
      method: "POST",
      body: JSON.stringify({ macro, period_override: periodOverride || null }),
    }),
  // 껄무새 AI 원인 분석 (온디맨드). 서버 OpenAI 키 사용. 키 없거나 실패 시
  // 규칙기반 해설 + ai_error 로 폴백해 응답.
  explainAi: (macro, periodOverride) =>
    req("/api/explain/ai", {
      method: "POST",
      body: JSON.stringify({ macro, period_override: periodOverride || null }),
    }),
  // parameter sweep (익절/손절 자동 최적화). tpValues/slValues optional (server defaults).
  optimize: (macro, tpValues, slValues) =>
    req("/api/optimize", {
      method: "POST",
      body: JSON.stringify({ macro, tp_values: tpValues || null, sl_values: slValues || null }),
    }),

  gallery: () => req("/api/gallery"),
  cardUrl: (slug) => `/api/card/${slug}.png`,

  // kimchi premium (reference indicator; upbit vs binance×USDKRW)
  kimchiPremium: (symbol) => req(`/api/kimchi-premium?symbol=${encodeURIComponent(symbol || "BTC")}`),

  // approximate USD→KRW rate (reference only) for showing 원화 next to USDT amounts
  usdKrw: () => req("/api/usdkrw"),

  // average daily USDT-M funding cost (%) for the symbol/period (real futures data)
  fundingRate: (symbol, preset, start, end) => {
    const q = new URLSearchParams({ symbol, preset: preset || "1y" });
    if (start) q.set("start", start);
    if (end) q.set("end", end);
    return req(`/api/funding-rate?${q.toString()}`);
  },

  // 오늘의 AI 챌린지 (KST 하루 1회 생성; symbol + 🤖 이름)
  challengeToday: () => req("/api/challenge/today"),

  // '오늘의 경주마' hot coins (server-cached, shared across clients)
  hotCoins: (limit) => req(`/api/hot-coins?limit=${limit || 10}`),

  // '오늘의 코인동향' — 시장·규제 뉴스 헤드라인 + AI 중립 개요 (KST 하루 1회 캐시)
  newsMarket: () => req("/api/news/market"),
  // '경주마 동향' — 코인별 최신 뉴스 헤드라인
  newsCoin: (symbol) => req(`/api/news/coin/${encodeURIComponent(symbol)}`),

  // 한강 수온 (server-cached proxy of the public Hangang temperature API)
  hangangTemp: () => req("/api/hangang-temp"),

  // [차후 도입] '고래 동향' — 서버 라우트가 아직 꺼져 있어 지금 호출하면 404 입니다.
  whaleActivity: () => req("/api/whale-activity"),

  // 실시간 봉차트용 최근 캔들 (서버 캐시; 마지막 봉은 진행 중이라 closed=false)
  candles: (symbol, interval, limit) =>
    req(
      `/api/candles?symbol=${encodeURIComponent(symbol)}` +
        `&interval=${encodeURIComponent(interval || "1m")}&limit=${limit || 120}`
    ),

  // 오늘의 리더보드 (daily KST paper-return board)
  leaderboard: (userId) => req(`/api/leaderboard?user_id=${encodeURIComponent(userId || "")}`),
  leaderboardRegister: (macro, username, password, userId, mode) =>
    req("/api/leaderboard/register", {
      method: "POST",
      body: JSON.stringify({ macro, username, password, user_id: userId, mode: mode || "live" }),
    }),
  leaderboardEdit: (entryId, macro, password, mode) =>
    req(`/api/leaderboard/${entryId}/edit`, {
      method: "POST",
      body: JSON.stringify({ macro, password: password || "", mode: mode || "live" }),
    }),
  // 계정 소유 엔트리 삭제 (로그인 필요, 소유자만).
  leaderboardDelete: (entryId) =>
    req(`/api/leaderboard/${entryId}`, { method: "DELETE" }),
  leaderboardVote: (entryId, userId, value) =>
    req(`/api/leaderboard/${entryId}/vote`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, value }),
    }),
  // 포인트를 소진해 매크로 공개+복사 (창작자에게 70% 분배). 로그인 필요.
  leaderboardUnlock: (entryId) =>
    req(`/api/leaderboard/${entryId}/unlock`, { method: "POST" }),

  // leaderboard chat (daily KST)
  chatList: () => req("/api/chat"),
  chatPost: (username, text) =>
    req("/api/chat", { method: "POST", body: JSON.stringify({ username, text }) }),

  // paper (simulated) trading
  paperStart: (macro, symbol, mode) =>
    req("/api/paper/start", { method: "POST", body: JSON.stringify({ macro, symbol, mode }) }),
  paperStop: (sessionId) => req(`/api/paper/${sessionId}/stop`, { method: "POST" }),
  paperStatus: (sessionId) => req(`/api/paper/${sessionId}`),

  // real-trade executable bundle (demo mockup zip). Triggers a file download.
  async downloadBundle(macro) {
    const res = await fetch("/api/realtrade/bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ macro }),
    });
    if (!res.ok) throw new Error("번들 생성 실패");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `realtrade-bot-${macro.rule_type}-${macro.position_side}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
