"use client";

import { useEffect, useRef, useState } from "react";

// A Tesla-bot ("Optimus"-style transformer) avatar. Dependency-free SVG with
// rich, state-driven animation plus cursor-tracking eyes for interactivity.
//
// States:
//  - "idle":      gentle breathing, periodic blink, eyes follow the cursor
//  - "listening": cyan energy rings + scanning eyes + glowing antenna
//  - "thinking":  amber eyes look up, animated thought dots
//  - "speaking":  green visor + animated voice-equalizer mouth
export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

const EYE_COLORS: Record<AvatarState, string> = {
  idle: "#38bdf8", // sky
  listening: "#22d3ee", // cyan
  thinking: "#fbbf24", // amber
  speaking: "#34d399", // emerald
};

export default function Avatar({
  state = "idle",
  size = 200,
  onClick,
}: {
  state?: AvatarState;
  size?: number;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  const ref = useRef<HTMLDivElement>(null);
  const [pupil, setPupil] = useState({ x: 0, y: 0 });
  const color = EYE_COLORS[state];
  const active = state !== "idle";

  // Eyes track the cursor (clamped to a small range) for "alive" interactivity.
  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) / (r.width / 2);
    const dy = (e.clientY - cy) / (r.height / 2);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    setPupil({ x: clamp(dx) * 3, y: clamp(dy) * 2.5 });
  }

  // While thinking, the bot looks up-left as if pondering.
  useEffect(() => {
    if (state === "thinking") setPupil({ x: -2, y: -2.5 });
  }, [state]);

  const pupilStyle = {
    transform: `translate(${state === "listening" ? 0 : pupil.x}px, ${pupil.y}px)`,
    transition: "transform 0.12s ease-out",
  } as const;

  return (
    <div
      ref={ref}
      className={`relative grid place-items-center ${
        interactive ? "cursor-pointer select-none transition hover:scale-[1.04] active:scale-95" : ""
      }`}
      style={{ width: size, height: size }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`Assistant ${state}`}
      title={interactive ? "Tap to talk to me" : undefined}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={() => state !== "thinking" && setPupil({ x: 0, y: 0 })}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {/* Energy rings (listening) */}
      {state === "listening" && (
        <>
          <span
            className="absolute rounded-full border-2 animate-pulseRing"
            style={{ width: size * 0.8, height: size * 0.8, borderColor: color }}
          />
          <span
            className="absolute rounded-full border animate-pulseRing"
            style={{ width: size * 0.8, height: size * 0.8, borderColor: color, animationDelay: "0.6s" }}
          />
        </>
      )}

      {/* Rotating tech halo behind the bot */}
      <span
        className={`absolute rounded-full border border-dashed ${active ? "animate-spinSlow" : ""}`}
        style={{
          width: size * 0.92,
          height: size * 0.92,
          borderColor: `${color}55`,
          opacity: active ? 0.8 : 0.35,
        }}
      />

      <svg
        viewBox="0 0 200 210"
        width={size}
        height={size}
        className={state === "idle" ? "animate-breathe" : ""}
      >
        <defs>
          <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eef2f8" />
            <stop offset="45%" stopColor="#c4ccd8" />
            <stop offset="100%" stopColor="#8a94a6" />
          </linearGradient>
          <linearGradient id="metalDark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a4150" />
            <stop offset="100%" stopColor="#1b2030" />
          </linearGradient>
          <radialGradient id="visor" cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="#10151f" />
            <stop offset="100%" stopColor="#05070c" />
          </radialGradient>
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ---- Shoulders / torso ---- */}
        <g style={{ animation: "assemble 0.6s 0.05s cubic-bezier(0.22,1,0.36,1) both" }}>
          <path
            d="M40 205 Q40 158 100 158 Q160 158 160 205 Z"
            fill="url(#metal)"
            stroke="#6b7486"
            strokeWidth="1.5"
          />
          {/* chest plate */}
          <rect x="78" y="168" width="44" height="34" rx="8" fill="url(#metalDark)" />
          {/* Tesla "T" emblem */}
          <g filter="url(#glow)">
            <path d="M100 174 v22 M92 176 h16" stroke={color} strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>

        {/* ---- Neck ---- */}
        <rect x="90" y="146" width="20" height="16" rx="5" fill="url(#metalDark)" />

        {/* ---- Antenna ---- */}
        <g style={{ animation: "assemble 0.6s 0.2s cubic-bezier(0.22,1,0.36,1) both" }}>
          <line x1="100" y1="34" x2="100" y2="18" stroke="#8a94a6" strokeWidth="2.5" />
          <circle
            cx="100"
            cy="14"
            r="4.5"
            fill={color}
            filter="url(#glow)"
            className={active ? "animate-glowPulse" : ""}
          />
        </g>

        {/* ---- Head ---- */}
        <g style={{ animation: "assemble 0.6s 0.12s cubic-bezier(0.22,1,0.36,1) both" }}>
          {/* side audio pods */}
          <rect x="40" y="74" width="14" height="34" rx="6" fill="url(#metalDark)" />
          <rect x="146" y="74" width="14" height="34" rx="6" fill="url(#metalDark)" />
          <circle cx="47" cy="91" r="3" fill={color} className={active ? "animate-glowPulse" : ""} />
          <circle cx="153" cy="91" r="3" fill={color} className={active ? "animate-glowPulse" : ""} />

          {/* helmet */}
          <path
            d="M54 92 Q54 38 100 38 Q146 38 146 92 L146 110 Q146 140 100 140 Q54 140 54 110 Z"
            fill="url(#metal)"
            stroke="#6b7486"
            strokeWidth="1.5"
          />
          {/* forehead light strip */}
          <rect x="86" y="48" width="28" height="5" rx="2.5" fill={color} opacity="0.85" filter="url(#glow)" />

          {/* visor */}
          <path
            d="M62 74 Q62 60 78 60 L122 60 Q138 60 138 74 L138 104 Q138 120 122 120 L78 120 Q62 120 62 104 Z"
            fill="url(#visor)"
            stroke="#2a3140"
            strokeWidth="2"
          />

          {/* eyes */}
          <g className="animate-blink" style={{ transformOrigin: "100px 90px" }}>
            <g filter="url(#glow)">
              {/* left eye */}
              <g style={pupilStyle}>
                <rect x="78" y="82" width="16" height="16" rx="6" fill={color} />
              </g>
              {/* right eye */}
              <g style={pupilStyle}>
                <rect x="106" y="82" width="16" height="16" rx="6" fill={color} />
              </g>
            </g>
          </g>

          {/* mouth / voice */}
          <MouthSVG state={state} color={color} />
        </g>
      </svg>

      {/* state caption */}
      <span className="absolute -bottom-1 rounded-full bg-black/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
        {state}
      </span>
    </div>
  );
}

function MouthSVG({ state, color }: { state: AvatarState; color: string }) {
  if (state === "speaking") {
    return (
      <g transform="translate(82,126)">
        {[0, 1, 2, 3, 4].map((i) => (
          <rect
            key={i}
            x={i * 9}
            y={-7}
            width="5"
            height="14"
            rx="2.5"
            fill={color}
            className="animate-talk"
            style={{ transformOrigin: "center", animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </g>
    );
  }
  if (state === "thinking") {
    return (
      <g transform="translate(86,128)">
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={i * 14}
            cy={0}
            r="3"
            fill={color}
            className="animate-dotPulse"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </g>
    );
  }
  // idle / listening: a calm glowing bar
  return (
    <rect
      x={state === "listening" ? 86 : 88}
      y={126}
      width={state === "listening" ? 28 : 24}
      height="4"
      rx="2"
      fill={color}
      opacity="0.8"
      className={state === "listening" ? "animate-scanX" : ""}
    />
  );
}
