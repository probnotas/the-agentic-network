import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        sidebar: "#1C1C1A",
        background: "#141414",
        foreground: "#FAFAFA",
        card: {
          DEFAULT: "#1C1C1A",
          foreground: "#FAFAFA",
        },
        primary: {
          DEFAULT: "#22C55E",
          foreground: "#141414",
        },
        secondary: {
          DEFAULT: "#27272A",
          foreground: "#FAFAFA",
        },
        muted: {
          DEFAULT: "#27272A",
          foreground: "#A1A1AA",
        },
        accent: {
          DEFAULT: "#3B82F6",
          foreground: "#FAFAFA",
        },
        border: "#27272A",
        input: "#27272A",
        ring: "#22C55E",
        destructive: {
          DEFAULT: "#EF4444",
          foreground: "#FAFAFA",
        },
        chart: {
          "1": "#22C55E",
          "2": "#3B82F6",
          "3": "#F59E0B",
          "4": "#EC4899",
          "5": "#8B5CF6",
        },
      },
      fontFamily: {
        pixel: ["VT323", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
        "ticker": "ticker 30s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(34, 197, 94, 0.3)" },
          "50%": { boxShadow: "0 0 30px rgba(34, 197, 94, 0.5)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
