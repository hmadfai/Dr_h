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
        tid: {
          navy: "#042f7e",
          navyDark: "#032b74",
          navyLight: "#0844ad",
          accent: "#2867B2",
          muted: "#f6f6f6",
          ink: "#1b1b1b",
          line: "#d0d2db",
        },
      },
      fontFamily: {
        sans: ["var(--font-poppins)", "Lato", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
