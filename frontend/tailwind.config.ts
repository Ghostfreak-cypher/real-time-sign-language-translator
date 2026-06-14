import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#f4f3ee",
        foreground: "#1c1917",
        card: "#ffffff",
        border: "#e5e1db",
        muted: "#78716c",
        brand: "#c15f3c",
        "brand-light": "#fdf0eb",
        "brand-muted": "#e8c4b4",
        "brand-dark": "#a04e30",
        success: "#4a7c59",
        danger: "#b84040",
        warning: "#a16207",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(28,25,23,0.06), 0 4px 16px rgba(28,25,23,0.04)",
        "card-hover": "0 2px 8px rgba(28,25,23,0.08), 0 8px 24px rgba(28,25,23,0.06)",
        brand: "0 0 0 2px rgba(193,95,60,0.25), 0 4px 16px rgba(193,95,60,0.12)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.4s ease-out both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
