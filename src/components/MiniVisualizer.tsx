"use client";

import { useMemo } from "react";

interface MiniVisualizerProps {
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Number of bars to render */
  barCount?: number;
}

/**
 * A mini frequency-spectrum visualizer that sits above the progress bar
 * in the player. Uses CSS animations with randomized parameters to
 * simulate live audio analysis without Web Audio API (which breaks
 * iOS Safari).
 */
export default function MiniVisualizer({
  isPlaying,
  barCount = 48,
}: MiniVisualizerProps) {
  // Generate stable random values for each bar (only once)
  const bars = useMemo(() => {
    // Seed-based pseudo-random for consistent SSR/CSR rendering
    const rng = (i: number) => {
      const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };

    return Array.from({ length: barCount }, (_, i) => {
      const r = rng(i);
      const r2 = rng(i + barCount);
      const r3 = rng(i + barCount * 2);

      // Create a natural spectrum shape: taller in the low-mid range, shorter at edges
      const position = i / barCount;
      const spectrumShape =
        0.3 + 0.7 * Math.sin(position * Math.PI) * (0.6 + 0.4 * r);

      return {
        // Height as percentage of container (10%–100%)
        minHeight: 8 + r * 12,
        maxHeight: Math.round(spectrumShape * 100),
        // Animation duration: 0.3s–0.9s (faster = more energetic)
        duration: 0.3 + r2 * 0.6,
        // Stagger the start
        delay: r3 * 0.8,
      };
    });
  }, [barCount]);

  return (
    <div
      className="flex items-end justify-center gap-px w-full overflow-hidden"
      style={{ height: 28 }}
      aria-hidden="true"
    >
      {bars.map((bar, i) => (
        <div
          key={i}
          className="flex-1 min-w-0 rounded-t-sm origin-bottom"
          style={{
            background:
              "linear-gradient(to top, rgba(59,130,246,0.7), rgba(59,130,246,0.2))",
            height: isPlaying ? `${bar.maxHeight}%` : `${bar.minHeight}%`,
            animation: isPlaying
              ? `vizBar ${bar.duration}s ease-in-out ${bar.delay}s infinite alternate`
              : "none",
            transition: isPlaying
              ? "none"
              : "height 0.6s ease-out",
            opacity: isPlaying ? 1 : 0.3,
          }}
        />
      ))}
    </div>
  );
}
