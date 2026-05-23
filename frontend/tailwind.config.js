/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        clinical: {
          bg: "#050d1a",
          panel: "#081426",
          card: "#0c1a2e",
          border: "#18324f",
          muted: "#8aa0b8",
          cyan: "#00c8ff",
        },
        classNormal: "#22c55e",
        classBenign: "#3b82f6",
        classLeukoplakia: "#f59e0b",
        classOscc: "#ef4444",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        cyan: "0 0 34px rgba(0, 200, 255, 0.16)",
      },
      animation: {
        "fade-in": "fadeIn 500ms ease-out both",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
