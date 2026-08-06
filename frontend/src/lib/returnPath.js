const KEY = "ggp_auth_return:v1";
const MAX_AGE_MS = 30 * 60 * 1000;

export function safeLocalPath(value, fallback = "") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return fallback;
  }
  return value;
}

export function rememberAuthReturn(path) {
  const safe = safeLocalPath(path);
  if (!safe) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ path: safe, saved_at: Date.now() }));
  } catch (_) {
    // A remembered return is a convenience; the explicit URL still works.
  }
}

export function recallAuthReturn(fallback = "/leaderboard") {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (!value || Date.now() - Number(value.saved_at || 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return fallback;
    }
    return safeLocalPath(value.path, fallback);
  } catch (_) {
    return fallback;
  }
}

export function clearAuthReturn() {
  try {
    sessionStorage.removeItem(KEY);
  } catch (_) {}
}
