import { useEffect, useRef, useState } from "react";
import { GLOSSARY } from "../lib/glossary.js";

// ⓘ help icon that reveals a plain-language explanation.
// Desktop: hover. Mobile/touch: tap toggles (and tap-outside closes).
// placement: "top" (default) or "bottom" — use "bottom" near the page top where
// an upward tooltip would be clipped (e.g. the kimchi banner).
export default function InfoTooltip({ term, text, placement = "top" }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0); // px nudge to keep the bubble on screen
  const ref = useRef(null);
  const tipRef = useRef(null);
  const content = text || GLOSSARY[term] || "";
  const posCls =
    placement === "bottom"
      ? "top-full mt-2"
      : "bottom-full mb-2";

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  // The bubble is centred on a 16px icon, so near either screen edge it would
  // hang off the viewport and give the whole page a horizontal scrollbar.
  // Measure once per open and slide it back inside.
  useEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const el = tipRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    if (r.left < margin) setShift(margin - r.left);
    else if (r.right > window.innerWidth - margin) setShift(window.innerWidth - margin - r.right);
  }, [open]);

  if (!content) return null;

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle ml-1"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="설명 보기"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="w-4 h-4 rounded-full bg-slate-300 text-[10px] leading-none text-slate-900 flex items-center justify-center hover:bg-blue-500"
      >
        ⓘ
      </button>
      {open && (
        <span
          ref={tipRef}
          role="tooltip"
          style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
          className={
            "absolute left-1/2 w-56 max-w-[calc(100vw-1rem)] z-40 " +
            posCls +
            " rounded-lg bg-slate-50 border border-slate-300 px-3 py-2" +
            " text-xs leading-relaxed text-slate-800 shadow-xl"
          }
        >
          {content}
        </span>
      )}
    </span>
  );
}
