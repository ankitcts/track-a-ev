"use client";

import { useEffect, useRef, useState } from "react";

// A full-body Tesla-bot ("Optimus"-style) that actually walks: swinging arms and
// legs, a bobbing torso, cursor-tracking eyes, blinking, and per-state reactions.
// Dependency-free inline SVG + Tailwind keyframes.
//
// States:
//  - "idle":      slow walk-in-place + breathing, eyes follow the cursor
//  - "listening": brisk gait, cyan energy rings, glowing antenna/pods
//  - "thinking":  measured gait, amber eyes look up + thought dots
//  - "speaking":  green visor + animated voice-equalizer mouth
export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

const EYE_COLORS: Record<AvatarState, string> = {
  idle: "#38bdf8",
  listening: "#22d3ee",
  thinking: "#fbbf24",
  speaking: "#34d399",
};

// Walk-cycle seconds per state (smaller = faster gait).
const CYCLE: Record<AvatarState, number> = {
  idle: 1.7,
  listening: 0.8,
  thinking: 1.2,
  speaking: 1.0,
};

export default function Avatar({
  state = "idle",
  size = 190,
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
  const cycle = CYCLE[state];

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    setPupil({ x: clamp(dx) * 3, y: clamp(dy) * 2.5 });
  }

  useEffect(() => {
    if (state === "thinking") setPupil({ x: -2, y: -2.5 });
  }, [state]);

  const pupilStyle = {
    transform: `translate(${pupil.x}px, ${pupil.y}px)`,
    transition: "transform 0.12s ease-out",
  } as const;

  // Limb gait helpers. Opposite phase via a negative half-cycle delay.
  const limb = (phaseOffset: boolean) => ({
    transformBox: "fill-box" as const,
    transformOrigin: "center top",
    animationName: "limbSwing",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite" as const,
    animationDuration: `${cycle}s`,
    animationDelay: `${phaseOffset ? -cycle / 2 : 0}s`,
  });
  const bobStyle = {
    transformBox: "fill-box" as const,
    transformOrigin: "center",
    animationName: "bob",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite" as const,
    animationDuration: `${cycle / 2}s`,
  } as const;

  const width = size;
  const height = size * (300 / 180);

  return (
    <div
      ref={ref}
      className={`relative grid place-items-center ${
        interactive ? "cursor-pointer select-none transition hover:scale-[1.03] active:scale-95" : ""
      }`}
      style={{ width, height }}
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
            style={{ width: width * 0.7, height: width * 0.7, borderColor: color }}
          />
          <span
            className="absolute rounded-full border animate-pulseRing"
            style={{ width: width * 0.7, height: width * 0.7, borderColor: color, animationDelay: "0.6s" }}
          />
        </>
      )}

      <svg viewBox="0 0 180 300" width={width} height={height}>
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
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ground shadow */}
        <ellipse
          cx="90"
          cy="290"
          rx="46"
          ry="7"
          fill="#000"
          className="animate-shadowPulse"
          style={{ transformBox: "fill-box", transformOrigin: "center", animationDuration: `${cycle / 2}s` }}
        />

        {/* ---- LEGS (planted, swinging from hips; not bobbed) ---- */}
        {/* left leg */}
        <g transform="translate(76,176)">
          <g style={limb(false)}>
            <Leg color={color} />
          </g>
        </g>
        {/* right leg (opposite phase) */}
        <g transform="translate(104,176)">
          <g style={limb(true)}>
            <Leg color={color} />
          </g>
        </g>

        {/* ---- UPPER BODY (bobs with the gait) ---- */}
        <g style={bobStyle}>
          {/* arms (behind torso), opposite phase to same-side leg */}
          <g transform="translate(64,108)">
            <g style={limb(true)}>
              <Arm color={color} />
            </g>
          </g>
          <g transform="translate(116,108)">
            <g style={limb(false)}>
              <Arm color={color} />
            </g>
          </g>

          {/* torso */}
          <rect x="62" y="100" width="56" height="80" rx="16" fill="url(#metal)" stroke="#6b7486" strokeWidth="1.5" />
          <rect x="74" y="116" width="32" height="40" rx="8" fill="url(#metalDark)" />
          {/* chest Tesla "T" */}
          <g filter="url(#glow)">
            <path d="M90 122 v26 M80 124 h20" stroke={color} strokeWidth="3" strokeLinecap="round" />
          </g>
          {/* hip plate */}
          <rect x="68" y="168" width="44" height="16" rx="6" fill="url(#metalDark)" />

          {/* neck */}
          <rect x="82" y="86" width="16" height="16" rx="5" fill="url(#metalDark)" />

          {/* antenna */}
          <line x1="90" y1="30" x2="90" y2="16" stroke="#8a94a6" strokeWidth="2.5" />
          <circle cx="90" cy="12" r="4" fill={color} filter="url(#glow)" className={active ? "animate-glowPulse" : ""} />

          {/* head */}
          {/* audio pods */}
          <rect x="40" y="50" width="12" height="28" rx="5" fill="url(#metalDark)" />
          <rect x="128" y="50" width="12" height="28" rx="5" fill="url(#metalDark)" />
          <circle cx="46" cy="64" r="2.6" fill={color} className={active ? "animate-glowPulse" : ""} />
          <circle cx="134" cy="64" r="2.6" fill={color} className={active ? "animate-glowPulse" : ""} />
          {/* helmet */}
          <path
            d="M52 64 Q52 26 90 26 Q128 26 128 64 L128 78 Q128 100 90 100 Q52 100 52 78 Z"
            fill="url(#metal)"
            stroke="#6b7486"
            strokeWidth="1.5"
          />
          {/* forehead strip */}
          <rect x="78" y="36" width="24" height="4" rx="2" fill={color} opacity="0.85" filter="url(#glow)" />
          {/* visor */}
          <path
            d="M58 52 Q58 42 70 42 L110 42 Q122 42 122 52 L122 76 Q122 90 110 90 L70 90 Q58 90 58 76 Z"
            fill="url(#visor)"
            stroke="#2a3140"
            strokeWidth="2"
          />
          {/* eyes */}
          <g className="animate-blink" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
            <g filter="url(#glow)">
              <g style={pupilStyle}>
                <rect x="70" y="58" width="14" height="14" rx="5" fill={color} />
              </g>
              <g style={pupilStyle}>
                <rect x="96" y="58" width="14" height="14" rx="5" fill={color} />
              </g>
            </g>
          </g>
          {/* mouth / voice */}
          <Mouth state={state} color={color} />
        </g>
      </svg>

      <span className="absolute bottom-0 rounded-full bg-black/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
        {state === "idle" ? "tap to talk" : state}
      </span>
    </div>
  );
}

function Leg({ color }: { color: string }) {
  return (
    <g>
      <rect x="-8" y="0" width="16" height="92" rx="8" fill="url(#metal)" stroke="#6b7486" strokeWidth="1.2" />
      {/* knee accent */}
      <rect x="-8" y="44" width="16" height="6" rx="3" fill={color} opacity="0.55" />
      {/* foot */}
      <path d="M-10 88 L16 88 Q20 88 20 92 L20 98 Q20 100 18 100 L-10 100 Q-12 100 -12 98 Z" fill="url(#metalDark)" />
    </g>
  );
}

function Arm({ color }: { color: string }) {
  return (
    <g>
      <rect x="-6" y="0" width="12" height="74" rx="6" fill="url(#metal)" stroke="#6b7486" strokeWidth="1.2" />
      {/* elbow accent */}
      <rect x="-6" y="36" width="12" height="5" rx="2.5" fill={color} opacity="0.55" />
      {/* hand */}
      <circle cx="0" cy="78" r="7" fill="url(#metalDark)" />
    </g>
  );
}

function Mouth({ state, color }: { state: AvatarState; color: string }) {
  if (state === "speaking") {
    return (
      <g transform="translate(74,82)">
        {[0, 1, 2, 3, 4].map((i) => (
          <rect
            key={i}
            x={i * 8}
            y={-6}
            width="4.5"
            height="12"
            rx="2.2"
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
      <g transform="translate(78,84)">
        {[0, 1, 2].map((i) => (
          <circle
            key={i}
            cx={i * 12}
            cy={0}
            r="2.6"
            fill={color}
            className="animate-dotPulse"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </g>
    );
  }
  return (
    <rect
      x={state === "listening" ? 78 : 80}
      y={82}
      width={state === "listening" ? 24 : 20}
      height="3.5"
      rx="1.8"
      fill={color}
      opacity="0.8"
      className={state === "listening" ? "animate-scanX" : ""}
    />
  );
}
