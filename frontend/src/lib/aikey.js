// BYOK: the user's own Gemini API key, kept ONLY in this browser (localStorage).
// It is sent to our backend per request to call Gemini, and never committed or
// shared. Warn users not to use this on a shared/public computer.
const STORAGE_KEY = "gg_gemini_key";

export function getGeminiKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setGeminiKey(v) {
  try {
    if (v) localStorage.setItem(STORAGE_KEY, v);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore storage errors (private mode etc.) */
  }
}
