"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/context/PlayerContext";

export default function SoundCloudWidget() {
  const {
    state,
    widgetRef: sharedWidgetRef,
    volumeRef,
    currentTrack,
    next,
    setIsPlaying,
    setProgress,
    setDuration,
  } = usePlayer();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadedTrackUrlRef = useRef<string | null>(null);
  const scriptLoadedRef = useRef(false);
  const widgetInitializedRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  const isLoadingTrackRef = useRef(false);

  // Stable refs for callbacks used inside widget event bindings
  const nextRef = useRef(next);
  const setIsPlayingRef = useRef(setIsPlaying);
  const setProgressRef = useRef(setProgress);
  const setDurationRef = useRef(setDuration);
  nextRef.current = next;
  setIsPlayingRef.current = setIsPlaying;
  setProgressRef.current = setProgress;
  setDurationRef.current = setDuration;

  // Load the Widget API script
  useEffect(() => {
    if (scriptLoadedRef.current) return;
    if (document.querySelector('script[src="https://w.soundcloud.com/player/api.js"]')) {
      scriptLoadedRef.current = true;
      return;
    }

    const script = document.createElement("script");
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
    };
    document.body.appendChild(script);
  }, []);

  // Initialize widget and load track when currentTrack changes
  useEffect(() => {
    if (!currentTrack || !iframeRef.current) return;
    if (loadedTrackUrlRef.current === currentTrack.permalink_url) return;

    const waitForScript = () => {
      if (!scriptLoadedRef.current || !window.SC) {
        setTimeout(waitForScript, 100);
        return;
      }

      // Initialize widget on first use by setting the iframe src with the actual track
      if (!widgetInitializedRef.current) {
        const widgetUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(currentTrack.permalink_url)}&auto_play=true`;
        iframeRef.current!.src = widgetUrl;

        const onIframeLoad = () => {
          iframeRef.current?.removeEventListener("load", onIframeLoad);

          const widget = window.SC.Widget(iframeRef.current!);
          sharedWidgetRef.current = widget;
          widgetInitializedRef.current = true;
          loadedTrackUrlRef.current = currentTrack.permalink_url;
          isLoadingTrackRef.current = false;

          const events = window.SC.Widget.Events;

          widget.bind(events.READY, () => {
            // Use volumeRef for always-current volume value
            widget.setVolume(volumeRef.current);
            widget.getDuration((d: number) => {
              setDurationRef.current(d);
            });
            // Attempt to play — browsers may block this until user interaction
            widget.play();
          });

          widget.bind(events.PLAY, () => {
            consecutiveErrorsRef.current = 0;
            isLoadingTrackRef.current = false;
            setIsPlayingRef.current(true);
          });

          widget.bind(events.PAUSE, () => {
            setIsPlayingRef.current(false);
          });

          widget.bind(events.FINISH, () => {
            nextRef.current();
          });

          widget.bind(events.PLAY_PROGRESS, (data: unknown) => {
            const d = data as { currentPosition: number; relativePosition: number };
            setProgressRef.current(d.relativePosition);
          });

          widget.bind(events.ERROR, () => {
            consecutiveErrorsRef.current += 1;
            if (consecutiveErrorsRef.current <= 3) {
              setTimeout(() => {
                if (consecutiveErrorsRef.current > 0) {
                  nextRef.current();
                }
              }, 2000);
            }
          });
        };

        iframeRef.current!.addEventListener("load", onIframeLoad);
      } else if (sharedWidgetRef.current) {
        // Widget already initialized, just load new track
        loadedTrackUrlRef.current = currentTrack.permalink_url;
        isLoadingTrackRef.current = true;

        sharedWidgetRef.current.load(currentTrack.permalink_url, {
          auto_play: true,
          callback: () => {
            isLoadingTrackRef.current = false;
            // Re-apply volume after loading new track
            sharedWidgetRef.current?.setVolume(volumeRef.current);
            sharedWidgetRef.current?.getDuration((d: number) => {
              setDurationRef.current(d);
            });
          },
        });
      }
    };

    waitForScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  // On first user interaction, try to start playback if browser blocked autoplay
  useEffect(() => {
    const tryPlay = () => {
      if (sharedWidgetRef.current && widgetInitializedRef.current) {
        sharedWidgetRef.current.isPaused((paused: boolean) => {
          if (paused) {
            sharedWidgetRef.current?.play();
          }
        });
      }
      document.removeEventListener("click", tryPlay);
      document.removeEventListener("keydown", tryPlay);
      document.removeEventListener("touchstart", tryPlay);
    };
    document.addEventListener("click", tryPlay, { once: true });
    document.addEventListener("keydown", tryPlay, { once: true });
    document.addEventListener("touchstart", tryPlay, { once: true });
    return () => {
      document.removeEventListener("click", tryPlay);
      document.removeEventListener("keydown", tryPlay);
      document.removeEventListener("touchstart", tryPlay);
    };
  }, [sharedWidgetRef]);

  // Sync play/pause from user controls
  useEffect(() => {
    if (!sharedWidgetRef.current || !widgetInitializedRef.current || !currentTrack) return;

    sharedWidgetRef.current.isPaused((paused: boolean) => {
      if (state.isPlaying && paused) {
        sharedWidgetRef.current?.play();
      } else if (!state.isPlaying && !paused) {
        sharedWidgetRef.current?.pause();
      }
    });
  }, [state.isPlaying, currentTrack, sharedWidgetRef]);

  return (
    <iframe
      ref={iframeRef}
      id="sc-widget"
      width="0"
      height="0"
      allow="autoplay"
      style={{ position: "absolute", width: 0, height: 0, border: "none" }}
    />
  );
}
