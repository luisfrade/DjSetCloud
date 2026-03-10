"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";

interface ClockOverlayProps {
  onClose: () => void;
}

export default function ClockOverlay({ onClose }: ClockOverlayProps) {
  const { state, currentTrack, play, pause, next, previous } = usePlayer();
  const [time, setTime] = useState(new Date());

  // Update clock every second
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Request Wake Lock to keep the screen on while clock is visible
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;

    const request = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch {
        /* best-effort */
      }
    };
    request();

    // Re-acquire when the tab becomes visible again
    const onVisibility = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      wakeLock?.release();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Pre-computed random configs for visualiser bars (stable across re-renders)
  const bars = useMemo(
    () =>
      Array.from({ length: 40 }, () => ({
        delay: Math.random() * 0.6,
        duration: 0.25 + Math.random() * 0.65,
        height: 25 + Math.random() * 75,
      })),
    []
  );

  const stopPropagation = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    []
  );

  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");
  const isPlaying = state.isPlaying;

  const hasPrev = state.shuffle
    ? state.playHistory.length > 0
    : state.currentIndex > 0;
  const hasNext = state.shuffle
    ? state.tracks.length > 1
    : state.currentIndex < state.tracks.length - 1;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center select-none overflow-hidden cursor-pointer"
      onClick={onClose}
    >
      {/* ——— Animated glow layers ——— */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: "min(480px, 90vw)",
          height: "min(480px, 90vw)",
          background:
            "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)",
          animation: isPlaying
            ? "clockPulse 2s ease-in-out infinite"
            : "none",
          opacity: isPlaying ? 1 : 0.25,
          transition: "opacity 1s",
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: "min(680px, 130vw)",
          height: "min(680px, 130vw)",
          background:
            "radial-gradient(circle, rgba(59,130,246,0.09) 0%, transparent 55%)",
          animation: isPlaying
            ? "clockPulse 2s ease-in-out 1s infinite"
            : "none",
          opacity: isPlaying ? 1 : 0,
          transition: "opacity 1s",
        }}
      />

      {/* ——— Time display ——— */}
      <div className="relative z-10 flex items-baseline">
        <span
          className="text-7xl sm:text-8xl md:text-9xl font-bold tabular-nums tracking-wider"
          style={{
            color: "#60a5fa",
            textShadow: isPlaying
              ? "0 0 20px rgba(59,130,246,0.5), 0 0 50px rgba(59,130,246,0.25), 0 0 100px rgba(59,130,246,0.1)"
              : "0 0 10px rgba(59,130,246,0.2)",
            animation: isPlaying ? "clockGlow 2s ease-in-out infinite" : "none",
          }}
        >
          {hours}
        </span>

        <span
          className="text-6xl sm:text-7xl md:text-8xl font-bold mx-1 sm:mx-2"
          style={{
            color: "#60a5fa",
            animation: "clockBlink 1s steps(1) infinite",
          }}
        >
          :
        </span>

        <span
          className="text-7xl sm:text-8xl md:text-9xl font-bold tabular-nums tracking-wider"
          style={{
            color: "#60a5fa",
            textShadow: isPlaying
              ? "0 0 20px rgba(59,130,246,0.5), 0 0 50px rgba(59,130,246,0.25), 0 0 100px rgba(59,130,246,0.1)"
              : "0 0 10px rgba(59,130,246,0.2)",
            animation: isPlaying
              ? "clockGlow 2s ease-in-out 0.5s infinite"
              : "none",
          }}
        >
          {minutes}
        </span>

        <span
          className="text-3xl sm:text-4xl md:text-5xl font-bold tabular-nums ml-2 sm:ml-3 self-end mb-1 sm:mb-2"
          style={{
            color: "rgba(96,165,250,0.5)",
            textShadow: isPlaying
              ? "0 0 10px rgba(59,130,246,0.3)"
              : "none",
          }}
        >
          {seconds}
        </span>
      </div>

      {/* ——— Visualiser bars ——— */}
      <div
        className="relative z-10 flex items-end justify-center gap-[2px] sm:gap-[3px] mt-8 px-4"
        style={{ height: "56px", width: "min(420px, 85vw)" }}
      >
        {bars.map((cfg, i) => (
          <div
            key={i}
            className="flex-1 rounded-full origin-bottom"
            style={{
              backgroundColor: "rgba(59,130,246,0.45)",
              height: `${cfg.height}%`,
              transform: isPlaying ? undefined : "scaleY(0.1)",
              animation: isPlaying
                ? `visualizerBar ${cfg.duration}s ease-in-out ${cfg.delay}s infinite alternate`
                : "none",
              transition: "transform 0.5s ease",
            }}
          />
        ))}
      </div>

      {/* ——— Track info ——— */}
      {currentTrack && (
        <div className="relative z-10 mt-10 text-center px-8">
          <p className="text-white/50 text-base sm:text-lg truncate max-w-xs sm:max-w-sm">
            {currentTrack.title}
          </p>
          <p className="text-white/25 text-sm mt-1">
            {currentTrack.user.username}
          </p>
        </div>
      )}

      {/* ——— Playback controls ——— */}
      <div
        className="relative z-10 flex items-center gap-5 mt-8"
        onClick={stopPropagation}
      >
        {/* Previous */}
        <button
          onClick={previous}
          disabled={!hasPrev}
          className="p-2 text-white/40 hover:text-white/70 disabled:text-white/10 transition-colors"
          aria-label="Previous"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        {/* Play / Pause */}
        <button
          onClick={isPlaying ? pause : play}
          className="p-3 bg-blue-500/20 rounded-full text-blue-400 hover:bg-blue-500/30 transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Next */}
        <button
          onClick={next}
          disabled={!hasNext}
          className="p-2 text-white/40 hover:text-white/70 disabled:text-white/10 transition-colors"
          aria-label="Next"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </div>

      {/* ——— Close button ——— */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 z-20 p-2 text-white/15 hover:text-white/40 transition-colors"
        aria-label="Close clock"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* ——— Hint ——— */}
      <p className="absolute bottom-6 text-white/10 text-xs">
        Tap anywhere to close
      </p>
    </div>
  );
}
