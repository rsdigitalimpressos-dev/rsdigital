import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "brand-cyan": "#00A0DC",
        "brand-magenta": "#E5007D",
        "brand-yellow": "#FFD200",
        "brand-ink": "#161616",
        "brand-paper": "#FFFFFF",
        "brand-muted": "#575757",
        "brand-border": "#E6E6E6",
      },
      fontFamily: {
        sans: ["var(--font-sora)", "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        sora: ["var(--font-sora)", "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["var(--font-sora)", "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        brand: ["var(--font-brand)", "Outfit", "var(--font-sora)", "Inter", "sans-serif"],
      },
      fontWeight: {
        thin: "400",
        extralight: "400",
        light: "400",
        normal: "400",
        medium: "500",
        semibold: "600",
        bold: "600",
        extrabold: "600",
        black: "700",
      },
      borderRadius: {
        control: "6px",
        card: "12px",
      },
    },
  },
  plugins: [],
};

export default config;

