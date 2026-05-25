/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#4A6741",
          50:  "#f0f5ef",
          100: "#ddeadb",
          200: "#bcd5b8",
          300: "#93b88e",
          400: "#6d9967",
          500: "#4A6741",
          600: "#3b5234",
          700: "#2d3e27",
          800: "#1e2a1a",
          900: "#0f150d",
        },
        accent: {
          DEFAULT: "#8B6914",
          50:  "#fdf6e3",
          100: "#f8e9b8",
          200: "#f0d077",
          300: "#e0b23a",
          400: "#c28f1a",
          500: "#8B6914",
          600: "#6e530f",
          700: "#523e0b",
          800: "#372907",
          900: "#1b1503",
        },
        earth: {
          bg:   "#F5F0E8",
          text: "#2C2416",
          white:"#FDFAF5",
        },
      },
      fontFamily: {
        serif:  ["Cormorant Garamond", "Georgia", "serif"],
        sans:   ["DM Sans", "system-ui", "sans-serif"],
        deva:   ["Noto Sans Devanagari", "sans-serif"],
      },
      backgroundImage: {
        "hero-gradient": "linear-gradient(to bottom, rgba(44,36,22,0.3) 0%, rgba(44,36,22,0.6) 100%)",
      },
      keyframes: {
        "slide-up": {
          "0%":   { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "slide-up": "slide-up 0.7s ease-out",
        "fade-in":  "fade-in 0.5s ease-out",
      },
    },
  },
  plugins: [],
}

