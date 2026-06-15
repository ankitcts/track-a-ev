"use client";

// A lightweight, dependency-free animated avatar. It reacts to three states:
//  - "idle":      gentle float
//  - "listening": pulsing rings around it (mic is active)
//  - "speaking":  animated mouth bars (assistant is talking / reading back)
export type AvatarState = "idle" | "listening" | "speaking";

export default function Avatar({
  state = "idle",
  size = 160,
  onClick,
}: {
  state?: AvatarState;
  size?: number;
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  return (
    <div
      className={`relative grid place-items-center ${
        interactive ? "cursor-pointer select-none transition hover:scale-105 active:scale-95" : ""
      }`}
      style={{ width: size, height: size }}
      aria-label={`Assistant ${state}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
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
      {state === "listening" && (
        <>
          <span className="absolute inset-0 rounded-full border border-sky-400/50 animate-pulseRing" />
          <span
            className="absolute inset-0 rounded-full border border-sky-400/40 animate-pulseRing"
            style={{ animationDelay: "0.5s" }}
          />
        </>
      )}

      <div
        className={`relative grid h-full w-full place-items-center rounded-full bg-gradient-to-b from-sky-400/30 to-indigo-500/20 ring-1 ring-white/15 ${
          state === "idle" ? "animate-float" : ""
        }`}
      >
        {/* face */}
        <div className="flex flex-col items-center gap-3">
          {/* eyes */}
          <div className="flex gap-5">
            <span className="h-3 w-3 rounded-full bg-white/90" />
            <span className="h-3 w-3 rounded-full bg-white/90" />
          </div>
          {/* mouth: bars animate while speaking, otherwise a calm line */}
          {state === "speaking" ? (
            <div className="flex h-6 items-end gap-1">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="w-1.5 origin-bottom rounded-full bg-white/90 animate-talk"
                  style={{ height: 22, animationDelay: `${i * 0.08}s` }}
                />
              ))}
            </div>
          ) : (
            <span
              className={`h-1.5 rounded-full bg-white/80 transition-all ${
                state === "listening" ? "w-10" : "w-8"
              }`}
            />
          )}
        </div>
      </div>

      <span className="absolute -bottom-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/70">
        {state}
      </span>
    </div>
  );
}
