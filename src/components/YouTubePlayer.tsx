"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/context/PlayerContext";
import type { YTPlayer } from "@/types";

/**
 * Hidden YouTube IFrame Player.
 *
 * Loads the YouTube IFrame API script, creates a tiny 1×1 player,
 * and wires state-change / progress events back into PlayerContext.
 * Playback commands (play, pause, seek, volume, loadVideoById) are
 * sent by PlayerContext through the shared ytPlayerRef.
 */
export default function YouTubePlayer() {
  const { onYTReady, onYTStateChange, onYTError, onYTProgress } = usePlayer();
  const initialized = useRef(false);

  useEffect(() => {
    // Guard against double-init (React 18 strict mode)
    if (initialized.current) return;
    initialized.current = true;

    let progressInterval: ReturnType<typeof setInterval> | null = null;
    let playerInstance: YTPlayer | null = null;

    const startPolling = () => {
      stopPolling();
      progressInterval = setInterval(() => {
        if (
          playerInstance &&
          typeof playerInstance.getCurrentTime === "function"
        ) {
          try {
            const t = playerInstance.getCurrentTime();
            const d = playerInstance.getDuration();
            if (d > 0) onYTProgress(t, d);
          } catch {
            /* player might not be ready */
          }
        }
      }, 500);
    };

    const stopPolling = () => {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    };

    const createPlayer = () => {
      const host = document.getElementById("yt-player-host");
      if (!host) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const YT = (window as any).YT;
      if (!YT?.Player) return;

      new YT.Player("yt-player-host", {
        height: "1",
        width: "1",
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin:
            typeof window !== "undefined" ? window.location.origin : "",
        },
        events: {
          onReady: (e: { target: YTPlayer }) => {
            playerInstance = e.target;
            onYTReady(e.target);
          },
          onStateChange: (e: { data: number }) => {
            onYTStateChange(e.data);
            // Start / stop progress polling based on YT state
            if (e.data === 1) {
              // PLAYING
              startPolling();
            } else {
              stopPolling();
            }
          },
          onError: () => {
            onYTError();
          },
        },
      });
    };

    // Check if YT IFrame API is already loaded
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).YT?.Player) {
      createPlayer();
    } else {
      // Chain onto any existing onYouTubeIframeAPIReady callback
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prev = (window as any).onYouTubeIframeAPIReady;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).onYouTubeIframeAPIReady = () => {
        if (typeof prev === "function") prev();
        createPlayer();
      };

      // Inject the script if not already present
      if (
        !document.querySelector('script[src*="youtube.com/iframe_api"]')
      ) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    return () => {
      stopPolling();
    };
    // All callback deps are stable useCallbacks with [] deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        width: 1,
        height: 1,
        opacity: 0,
        pointerEvents: "none",
        overflow: "hidden",
        bottom: 0,
        left: 0,
        zIndex: -1,
      }}
    >
      <div id="yt-player-host" />
    </div>
  );
}
