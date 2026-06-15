"use client";

import dynamic from "next/dynamic";

// Public avatar API (unchanged so callers don't need edits). The visual is a
// full 3D Tesla-bot rendered with three.js / React-Three-Fiber, loaded
// client-only (WebGL can't run during SSR).
export type AvatarState = "idle" | "listening" | "thinking" | "speaking";

const RobotScene = dynamic(() => import("./RobotScene"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-sky-400" />
    </div>
  ),
});

export default function Avatar({
  state = "idle",
  size = 230,
  onClick,
}: {
  state?: AvatarState;
  size?: number;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  return (
    <div
      className={`relative ${interactive ? "cursor-pointer select-none" : ""}`}
      style={{ width: size, height: size * 1.25 }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={`Assistant ${state}`}
      title={interactive ? "Tap to talk to me" : undefined}
      onClick={onClick}
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
      <RobotScene state={state} />
      <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
        {state === "idle" ? "tap to talk" : state}
      </span>
    </div>
  );
}
