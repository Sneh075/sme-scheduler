import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:    "#0F1729",
        slate1: "#5A6478",
        slate2: "#8A93A6",
        rule:   "#E2E5EC",
        paper:  "#FBFBFD",
        panel:  "#FFFFFF",
        blocker:"#B03A32",
        high:   "#A9691B",
        medium: "#3F6394",
        low:    "#5A6478",
        ok:     "#25705120",
        okfg:   "#1F6B4E",
        accent: "#33407A",
      },
      fontFamily: {
        sans: ["ui-sans-serif","system-ui","-apple-system","Segoe UI","Inter","sans-serif"],
        mono: ["ui-monospace","SFMono-Regular","Menlo","Consolas","monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
