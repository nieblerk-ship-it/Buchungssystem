/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#14121A",
        surface: "#1E1B26",
        surfaceAlt: "#241E29",
        border: "#2A2733",
        gold: "#C9A15E",
        wine: "#8C3B54",
        ivory: "#F5EFE6",
        muted: "#A79B8C",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
