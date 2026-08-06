import { useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  setStoredTheme,
  watchSystemTheme,
} from "../lib/theme.js";

export default function ThemeToggle({ className = "" }) {
  const [pref, setPref] = useState(getStoredTheme);
  const [systemTheme, setSystemTheme] = useState(() => resolveTheme("system"));

  // Re-apply on mount so React state and the pre-paint class can't drift.
  useEffect(() => {
    applyTheme(pref);
  }, [pref]);

  // Follow the OS while on "system".
  useEffect(() => {
    if (pref !== "system") return;
    return watchSystemTheme(() => {
      applyTheme("system");
      setSystemTheme(resolveTheme("system"));
    });
  }, [pref]);

  const resolved = pref === "system" ? systemTheme : pref;

  function toggle() {
    const next = resolved === "dark" ? "light" : "dark";
    setPref(next);
    setStoredTheme(next);
  }

  const isDark = resolved === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      aria-label={isDark ? "다크 모드 켜짐, 라이트 모드로 전환" : "다크 모드 꺼짐, 다크 모드로 전환"}
      aria-checked={isDark}
      role="switch"
      className={`theme-switch ${isDark ? "is-dark" : "is-light"} ${className}`}
    >
      <span className="theme-switch-track" aria-hidden="true">
        <span className="theme-switch-thumb">
          {isDark ? (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M13 10.3A5.5 5.5 0 0 1 5.7 3a5.5 5.5 0 1 0 7.3 7.3Z" /></svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" focusable="false"><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v1M8 12.5v2M1.5 8h1M13.5 8h1M3.4 3.4l.8.8M11.8 11.8l.8.8M12.6 3.4l-.8.8M4.2 11.8l-.8.8" /></svg>
          )}
        </span>
      </span>
    </button>
  );
}
