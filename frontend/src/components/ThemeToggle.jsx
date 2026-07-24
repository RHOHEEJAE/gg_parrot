import { useEffect, useState } from "react";
import {
  applyTheme,
  getStoredTheme,
  resolveTheme,
  setStoredTheme,
  watchSystemTheme,
} from "../lib/theme.js";

// Cycles 라이트 → 다크 → 시스템. "시스템" keeps following the OS setting, which
// is what most users actually want once they've set it at the OS level.
const NEXT = { light: "dark", dark: "system", system: "light" };
const META = {
  light: { icon: "☀️", label: "라이트", title: "라이트 테마 (클릭: 다크로)" },
  dark: { icon: "🌙", label: "다크", title: "다크 테마 (클릭: 시스템 설정 따르기)" },
  system: { icon: "🖥️", label: "시스템", title: "시스템 설정 따름 (클릭: 라이트로)" },
};

export default function ThemeToggle({ className = "" }) {
  const [pref, setPref] = useState(getStoredTheme);

  // Re-apply on mount so React state and the pre-paint class can't drift.
  useEffect(() => {
    applyTheme(pref);
  }, [pref]);

  // Follow the OS while on "system".
  useEffect(() => {
    if (pref !== "system") return;
    return watchSystemTheme(() => applyTheme("system"));
  }, [pref]);

  function cycle() {
    const next = NEXT[pref] || "light";
    setPref(next);
    setStoredTheme(next);
  }

  const meta = META[pref] || META.system;
  return (
    <button
      onClick={cycle}
      title={meta.title}
      aria-label={`테마: ${meta.label}`}
      className={
        "inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 " +
        "hover:bg-slate-200 px-2.5 py-1.5 text-sm text-slate-700 transition-colors " +
        className
      }
    >
      <span aria-hidden="true">{meta.icon}</span>
      <span className="hidden sm:inline">{meta.label}</span>
      {pref === "system" && (
        <span className="hidden md:inline text-xs text-slate-400">
          ({resolveTheme("system") === "dark" ? "다크" : "라이트"})
        </span>
      )}
    </button>
  );
}
