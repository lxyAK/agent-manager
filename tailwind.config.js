/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Tokyo Night 配色
        tn: {
          bg: "#1a1b26",
          "bg-light": "#e1e2e7",
          fg: "#c0caf5",
          "fg-light": "#3760bf",
          blue: "#7aa2f7",
          red: "#f7768e",
          green: "#9ece6a",
          yellow: "#e0af68",
          magenta: "#bb9af7",
          cyan: "#7dcfff",
          comment: "#565f89",
          selection: "#33467c",
          border: "#292e42",
          "border-light": "#b8c0d4",
          sidebar: "#16161e",
        },
      },
    },
  },
  plugins: [],
};
