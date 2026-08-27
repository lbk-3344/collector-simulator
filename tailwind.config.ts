import type { Config } from "tailwindcss";

// Tailwind is set up for utility-class convenience (spacing, flex, grid) in a few
// places, but the bulk of this app's visual language is the hand-written component
// CSS in app/globals.css, ported directly from style-guide.html / mockup-app-shell.html
// (cards, buttons, chips, the app shell, the users table, the bug modal). The color
// tokens below are wired to the same CSS custom properties so `bg-accent-primary`
// etc. stay in sync with globals.css if anyone reaches for a Tailwind utility instead.
const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        ui: ["var(--font-ui)"],
        mono: ["var(--font-mono)"],
      },
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        "surface-2": "var(--surface-2)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        "accent-brand": "var(--accent-brand)",
        "accent-brand-tint": "var(--accent-brand-tint)",
        "accent-brand-ink": "var(--accent-brand-ink)",
        "accent-primary": "var(--accent-primary)",
        "accent-primary-hover": "var(--accent-primary-hover)",
        "accent-primary-tint": "var(--accent-primary-tint)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
      },
    },
  },
  plugins: [],
};

export default config;
