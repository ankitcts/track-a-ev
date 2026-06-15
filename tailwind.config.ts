import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        talk: {
          "0%, 100%": { transform: "scaleY(0.4)" },
          "50%": { transform: "scaleY(1)" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.8)", opacity: "0.6" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        breathe: {
          "0%, 100%": { transform: "translateY(0) scale(1)" },
          "50%": { transform: "translateY(-4px) scale(1.012)" },
        },
        blink: {
          "0%, 92%, 100%": { transform: "scaleY(1)" },
          "96%": { transform: "scaleY(0.1)" },
        },
        glowPulse: {
          "0%, 100%": { opacity: "0.55", filter: "brightness(1)" },
          "50%": { opacity: "1", filter: "brightness(1.6)" },
        },
        spinSlow: {
          to: { transform: "rotate(360deg)" },
        },
        scanX: {
          "0%, 100%": { transform: "translateX(-2px)" },
          "50%": { transform: "translateX(2px)" },
        },
        assemble: {
          "0%": { opacity: "0", transform: "translateY(14px) scale(0.9)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        dotPulse: {
          "0%, 100%": { transform: "translateY(0)", opacity: "0.4" },
          "50%": { transform: "translateY(-3px)", opacity: "1" },
        },
        limbSwing: {
          "0%, 100%": { transform: "rotate(20deg)" },
          "50%": { transform: "rotate(-20deg)" },
        },
        bob: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
        shadowPulse: {
          "0%, 100%": { transform: "scaleX(1)", opacity: "0.35" },
          "50%": { transform: "scaleX(0.8)", opacity: "0.2" },
        },
      },
      animation: {
        talk: "talk 0.4s ease-in-out infinite",
        pulseRing: "pulseRing 1.4s ease-out infinite",
        float: "float 4s ease-in-out infinite",
        breathe: "breathe 4.5s ease-in-out infinite",
        blink: "blink 5s ease-in-out infinite",
        glowPulse: "glowPulse 1.2s ease-in-out infinite",
        spinSlow: "spinSlow 8s linear infinite",
        scanX: "scanX 1.6s ease-in-out infinite",
        assemble: "assemble 0.6s cubic-bezier(0.22,1,0.36,1) both",
        dotPulse: "dotPulse 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
