import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        slateText: "#334155",
        electric: "#1769ff",
        line: "#dbe3ef",
        panel: "#ffffff",
        mist: "#f5f8fc",
      },
      boxShadow: {
        cockpit: "0 16px 45px rgba(15, 23, 42, 0.08)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "SFMono-Regular", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
