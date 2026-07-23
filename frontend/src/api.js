// Thin API client. Relative URLs work in dev (Vite proxy) and in prod
// (FastAPI serves the built SPA and the /api routes from one origin).
const BASE = "";

async function req(path, opts) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
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
  createMacro: (macro) => req("/api/macros", { method: "POST", body: JSON.stringify(macro) }),
  getMacro: (slug) => req(`/api/macros/${slug}`),
  backtest: (macro, periodOverride) =>
    req("/api/backtest", {
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

  // '오늘의 경주마' hot coins (server-cached, shared across clients)
  hotCoins: (limit) => req(`/api/hot-coins?limit=${limit || 10}`),

  // 한강 수온 (server-cached proxy of the public Hangang temperature API)
  hangangTemp: () => req("/api/hangang-temp"),

  // '고래 동향' — on-chain top-holder buy/sell flow (server-cached, reference only)
  whaleActivity: () => req("/api/whale-activity"),

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
      body: JSON.stringify({ macro, password, mode: mode || "live" }),
    }),
  leaderboardVote: (entryId, userId, value) =>
    req(`/api/leaderboard/${entryId}/vote`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, value }),
    }),

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
