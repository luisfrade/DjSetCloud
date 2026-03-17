"use client";

import { useEffect, useState } from "react";

interface SplashScreenProps {
  /** Called when the splash is fully faded out and can be unmounted */
  onComplete: () => void;
  /** Whether the app data has finished loading */
  isLoaded: boolean;
}

export default function SplashScreen({ onComplete, isLoaded }: SplashScreenProps) {
  // Phase: "intro" → "idle" → "exit"
  // intro: initial animation sequence (~1.6s)
  // idle: vinyl keeps spinning until data is loaded
  // exit: fade out (~0.5s), then call onComplete
  const [phase, setPhase] = useState<"intro" | "idle" | "exit">("intro");

  // Wait one frame after mount before showing animated content.
  // iPad Safari can paint elements before CSS animations are parsed,
  // causing a flash of the unstyled disc in the wrong position.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setReady(true));
    });
  }, []);

  // After intro animation finishes, switch to idle
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => setPhase("idle"), 1600);
    return () => clearTimeout(timer);
  }, [ready]);

  // Once data is loaded AND we're past intro, start exit
  useEffect(() => {
    if (isLoaded && phase === "idle") {
      setPhase("exit");
    }
  }, [isLoaded, phase]);

  // After fade-out animation, unmount
  useEffect(() => {
    if (phase === "exit") {
      const timer = setTimeout(onComplete, 500);
      return () => clearTimeout(timer);
    }
  }, [phase, onComplete]);

  return (
    <div
      className="fixed inset-0 z-50 bg-gray-950 flex items-center justify-center overflow-hidden"
      style={
        phase === "exit"
          ? { animation: "splashFadeOut 0.5s ease-out forwards" }
          : undefined
      }
    >
      {/* Scan lines overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)",
          animation: "scanLines 2s linear infinite",
        }}
      />

      {/* Centered content — hidden until browser has completed initial layout (2 rAF frames)
           to prevent iPad Safari from flashing the disc off-center before animations start */}
      <div
        className="relative flex flex-col items-center gap-5"
        style={{ minHeight: 220, opacity: ready ? 1 : 0 }}
      >
        {/* Vinyl disc + glow wrapper (self-contained positioning) */}
        <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
          {/* Glow pulse behind disc */}
          <div
            className="absolute inset-0 m-auto w-24 h-24 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(59,130,246,0.6) 0%, transparent 70%)",
              animation: "splashGlow 1.2s ease-out forwards",
            }}
          />

          {/* Second glow wave (delayed) */}
          <div
            className="absolute inset-0 m-auto w-24 h-24 rounded-full"
            style={{
              background: "radial-gradient(circle, rgba(59,130,246,0.4) 0%, transparent 70%)",
              animation: "splashGlow 1.2s ease-out 0.3s forwards",
              opacity: 0,
            }}
          />

          {/* Vinyl disc */}
          <div
            className="relative"
            style={
              phase === "intro"
                ? {
                    opacity: 0,
                    transform: "scale(0)",
                    animation: "splashDisc 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards",
                  }
                : undefined
            }
          >
            <div
              className="w-20 h-20 bg-blue-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(59,130,246,0.5)]"
              style={
                phase !== "intro"
                  ? { animation: "splashIdleSpin 3s linear infinite" }
                  : undefined
              }
            >
            <svg
              className="w-16 h-16 text-white"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
              />
              <circle
                cx="12"
                cy="12"
                r="7.5"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeOpacity="0.5"
                fill="none"
              />
              <circle
                cx="12"
                cy="12"
                r="5"
                stroke="currentColor"
                strokeWidth="0.5"
                strokeOpacity="0.5"
                fill="none"
              />
              <circle
                cx="12"
                cy="12"
                r="3"
                fill="currentColor"
                fillOpacity="0.3"
              />
              <circle cx="12" cy="12" r="1.2" fill="currentColor" />
            </svg>
          </div>
        </div>
        </div>

        {/* Title with glitch effect */}
        <h1
          className="text-3xl font-bold text-white tracking-tight"
          style={{
            animation: "glitchText 1.2s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both",
            textShadow: "0 0 20px rgba(59,130,246,0.5), 0 0 40px rgba(59,130,246,0.2)",
          }}
        >
          DjSetCloud
        </h1>

        {/* Genre subtitle */}
        <span
          className="text-xs text-white/40 tracking-widest uppercase"
          style={{
            animation: "splashSubtitle 0.6s ease-out 0.8s both",
          }}
        >
          Afro House / House / Techno / Tech House
        </span>

        {/* Loading indicator (visible during idle phase) */}
        {phase !== "exit" && (
          <div
            className="flex items-center gap-2 mt-4"
            style={{
              animation: "splashSubtitle 0.4s ease-out 1.4s both",
            }}
          >
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-white/30">Loading sets...</span>
          </div>
        )}
      </div>
    </div>
  );
}
