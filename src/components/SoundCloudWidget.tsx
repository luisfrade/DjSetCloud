"use client";

import { useEffect, useRef } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { unlockAudioSession } from "@/lib/audioUnlock";

export default function SoundCloudWidget() {
  const {
    state,
    widgetRef: sharedWidgetRef,
    volumeRef,
    loadedUrlRef,
    currentTrack,
    next,
    setIsPlaying,
    setProgress,
    setDuration,
  } = usePlayer();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const scriptLoadedRef = useRef(false);
  const widgetInitializedRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  const isLoadingTrackRef = useRef(false);
  const playbackEverStartedRef = useRef(false);

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
    if (
      document.querySelector(
        'script[src="https://w.soundcloud.com/player/api.js"]'
      )
    ) {
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

  // Initialize widget OR load new track when currentTrack changes
  useEffect(() => {
    if (!currentTrack || !iframeRef.current) return;
    if (loadedUrlRef.current === currentTrack.permalink_url) return;

    const waitForScript = () => {
      if (!scriptLoadedRef.current || !window.SC) {
        setTimeout(waitForScript, 100);
        return;
      }

      // ——— First-time initialisation: set iframe src and create widget ———
      if (!widgetInitializedRef.current) {
        const widgetUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(currentTrack.permalink_url)}&auto_play=true`;
        iframeRef.current!.src = widgetUrl;
        loadedUrlRef.current = currentTrack.permalink_url;

        const onIframeLoad = () => {
          iframeRef.current?.removeEventListener("load", onIframeLoad);

          const widget = window.SC.Widget(iframeRef.current!);
          sharedWidgetRef.current = widget;
          widgetInitializedRef.current = true;
          isLoadingTrackRef.current = false;

          const events = window.SC.Widget.Events;

          widget.bind(events.READY, () => {
            widget.setVolume(volumeRef.current);
            widget.getDuration((d: number) => {
              setDurationRef.current(d);
            });
            // Attempt auto-play — browsers may block this
            widget.play();
          });

          widget.bind(events.PLAY, () => {
            consecutiveErrorsRef.current = 0;
            isLoadingTrackRef.current = false;
            playbackEverStartedRef.current = true;
            setIsPlayingRef.current(true);
          });

          widget.bind(events.PAUSE, () => {
            setIsPlayingRef.current(false);
          });

          widget.bind(events.FINISH, () => {
            nextRef.current();
          });

          widget.bind(events.PLAY_PROGRESS, (data: unknown) => {
            const d = data as {
              currentPosition: number;
              relativePosition: number;
            };
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
        // ——— Widget already initialised: load new track via widget.load() ———
        loadedUrlRef.current = currentTrack.permalink_url;
        isLoadingTrackRef.current = true;

        sharedWidgetRef.current.load(currentTrack.permalink_url, {
          auto_play: true,
          callback: () => {
            isLoadingTrackRef.current = false;
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

  // Persistent "unlock & play" listener.
  // On every user interaction we unlock the Web Audio API session and
  // tell the widget to play.  We keep the listener active until the
  // widget actually fires a PLAY event (playbackEverStartedRef).
  useEffect(() => {
    const tryPlay = () => {
      unlockAudioSession();
      if (sharedWidgetRef.current && widgetInitializedRef.current) {
        sharedWidgetRef.current.play();
      }
      // Once playback has started at least once, remove listeners
      if (playbackEverStartedRef.current) {
        document.removeEventListener("click", tryPlay, true);
        document.removeEventListener("touchstart", tryPlay, true);
      }
    };

    document.addEventListener("click", tryPlay, true);
    document.addEventListener("touchstart", tryPlay, true);

    return () => {
      document.removeEventListener("click", tryPlay, true);
      document.removeEventListener("touchstart", tryPlay, true);
    };
  }, [sharedWidgetRef]);

  // Sync play/pause from user controls
  useEffect(() => {
    if (!sharedWidgetRef.current || !widgetInitializedRef.current || !currentTrack)
      return;
    if (isLoadingTrackRef.current) return;

    if (state.isPlaying) {
      sharedWidgetRef.current.play();
    } else {
      sharedWidgetRef.current.pause();
    }
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
