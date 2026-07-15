import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "var(--font-noto-sans-tc)", "system-ui", "sans-serif"],
        "noto-tc": ["var(--font-noto-sans-tc)", "sans-serif"],
        inter: ["var(--font-inter)", "sans-serif"],
      },

      // All colors reference CSS custom properties defined in globals.css
      // Using var() makes oklch work reliably in Tailwind v3
      colors: {
        "bg-base":        "var(--color-bg)",
        "surface":        "var(--color-surface)",
        "surface-2":      "var(--color-surface-2)",
        "border-subtle":  "var(--color-border)",
        "border-strong":  "var(--color-border-strong)",
        "ink-900":        "var(--color-ink-900)",
        "ink-700":        "var(--color-ink-700)",
        "ink-500":        "var(--color-ink-500)",
        "ink-300":        "var(--color-ink-300)",
        "ink-200":        "var(--color-ink-200)",
        "accent":         "var(--color-accent)",
        "accent-soft":    "var(--color-accent-soft)",
        "accent-hover":   "var(--color-accent-hover)",

        "committee-admin":             "var(--color-admin)",
        "committee-admin-soft":        "var(--color-admin-soft)",
        "committee-admin-border":      "var(--color-admin-border)",
        "committee-discipline":        "var(--color-discipline)",
        "committee-discipline-soft":   "var(--color-discipline-soft)",
        "committee-discipline-border": "var(--color-discipline-border)",
        "committee-it":                "var(--color-it)",
        "committee-it-soft":           "var(--color-it-soft)",
        "committee-it-border":         "var(--color-it-border)",
        "committee-curriculum":        "var(--color-curriculum)",
        "committee-curriculum-soft":   "var(--color-curriculum-soft)",
        "committee-curriculum-border": "var(--color-curriculum-border)",
      },

      fontSize: {
        "display": ["2.75rem",   { lineHeight: "3.25rem",  fontWeight: "600" }],
        "h1":      ["1.875rem",  { lineHeight: "2.375rem", fontWeight: "600" }],
        "h2":      ["1.375rem",  { lineHeight: "1.875rem", fontWeight: "600" }],
        "h3":      ["1.0625rem", { lineHeight: "1.625rem", fontWeight: "500" }],
        "body":    ["0.875rem",  { lineHeight: "1.375rem", fontWeight: "400" }],
        "caption": ["0.6875rem", { lineHeight: "1rem",     fontWeight: "500" }],
      },

      spacing: {
        "sidebar": "220px",
      },

      borderRadius: {
        "card":  "12px",
        "pill":  "999px",
        "input": "8px",
      },

      boxShadow: {
        "card":    "0 1px 3px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)",
        "card-md": "0 4px 12px rgb(0 0 0 / 0.08)",
        "sidebar": "1px 0 0 0 var(--color-border)",
      },

      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":  "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};

export default config;
