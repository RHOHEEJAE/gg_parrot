/** @type {import('tailwindcss').Config} */

// Theming strategy: instead of sprinkling `dark:` variants across ~425 colour
// classes in 19 files, the palette itself is swapped. Every themed colour below
// resolves to a CSS variable, and `.dark` on <html> redefines those variables
// (see src/index.css). Components keep using `bg-slate-100`, `text-slate-500`
// etc. and flip automatically — no per-component edits, nothing to forget.
//
// `<alpha-value>` keeps Tailwind's opacity modifiers working (e.g. bg-surface/80).
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

// Steps are themed by role, which is what keeps solid buttons readable:
//   50/100/200 → tinted panel backgrounds  (light in light mode, dark in dark)
//   300/400    → borders
//   500/600    → solid button fills        (stay saturated; white text sits on them)
//   700/800    → text on tinted panels     (dark in light mode, light in dark)
const scale = (c, steps) => Object.fromEntries(steps.map((s) => [s, v(`--c-${c}-${s}`)]));

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Card/panel surface. Deliberately NOT Tailwind's `white`, because
        // `text-white` on buttons must stay literally white while surfaces flip.
        surface: v("--c-surface"),
        // Solid danger button fill. Separate from `red-600` because in dark
        // mode loss/error text must go light while a white-labelled button
        // must stay dark — one variable can't serve both.
        danger: v("--c-danger"),
        "danger-hover": v("--c-danger-hover"),
        slate: scale("slate", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        indigo: scale("indigo", [50, 100, 200, 300, 400, 500, 600, 700]),
        red: scale("red", [50, 100, 300, 400, 500, 600, 700, 800]),
        green: scale("green", [50, 300, 600, 700]),
        amber: scale("amber", [50, 100, 200, 300, 500, 600, 700, 800]),
        blue: scale("blue", [50, 300, 500, 600, 800]),
        cyan: scale("cyan", [50, 100, 200, 700, 800]),
        sky: scale("sky", [50, 100, 700, 800]),
      },
    },
  },
  plugins: [],
};
