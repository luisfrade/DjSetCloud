"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { unlockAudioSession } from "@/lib/audioUnlock";

export default function SoundCloudWidget() {
  const {
    state,
    widgetRef: sharedWidgetRef,
    iframeRef: sharedIframeRef,
    volumeRef,
    loadedUrlRef,
    pendingTrackRef,
    currentTrack,
    next,
    setIsPlaying,
    setProgress,
    setDuration,
  } = usePlayer();

  const localIframeRef = useRef<HTMLIFrameElement>(null);
  const scriptLoadedRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  const playbackStartedRef = useRef(false);

  // Stable refs for callbacks used inside widget event bindings
  const nextRef = useRef(next);
  const setIsPlayingRef = useRef(setIsPlaying);
  const setProgressRef = useRef(setProgress);
  const setDurationRef = useRef(setDuration);
  nextRef.current = next;
  setIsPlayingRef.current = setIsPlaying;
  setProgressRef.current = setProgress;
  setDurationRef.current = setDuration;

  // Share the iframe element with the context so playIndex can set .src directly
  useEffect(() => {
    sharedIframeRef.current = localIframeRef.current;
    return () => {
      sharedIframeRef.current = null;
    };
  }, [sharedIframeRef]);

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

  /**
   * initWidget — called every time the iframe loads.
   *
   * Because playIndex() sets iframe.src directly (for iOS gesture-chain compat),
   * the iframe reloads on every track change.  After each reload we must
   * re-create the widget controller and re-bind all events.
   */
  const initWidget = useCallback(() => {
    if (!localIframeRef.current || !window.SC) return;

    const widget = window.SC.Widget(localIframeRef.current);
    sharedWidgetRef.current = widget;

    const events = window.SC.Widget.Events;

    widget.bind(events.READY, () => {
      widget.setVolume(volumeRef.current);
      widget.getDuration((d: number) => {
        setDurationRef.current(d);
      });
      // Attempt play — iOS may block this (first load before any gesture)
      widget.play();
    });

    widget.bind(events.PLAY, () => {
      consecutiveErrorsRef.current = 0;
      playbackStartedRef.current = true;
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
  }, [sharedWidgetRef, volumeRef]);

  // Wait for the SC script to load, then check if there is a pending track to
  // set on the iframe (this covers the very first page load where playIndex
  // fires before the script/iframe are available).
  useEffect(() => {
    if (!pendingTrackRef.current) return;

    const waitForScript = () => {
      if (!scriptLoadedRef.current || !window.SC) {
        setTimeout(waitForScript, 100);
        return;
      }
      if (pendingTrackRef.current && localIframeRef.current) {
        const url = pendingTrackRef.current;
        pendingTrackRef.current = null;
        loadedUrlRef.current = url;
        localIframeRef.current.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=true`;
      }
    };
    waitForScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  // Handle iframe load events — re-init the widget each time
  useEffect(() => {
    const iframe = localIframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      // Only init if there is actually a src pointing to soundcloud
      if (!iframe.src || !iframe.src.includes("soundcloud.com")) return;
      // Wait for SC script
      const doInit = () => {
        if (!scriptLoadedRef.current || !window.SC) {
          setTimeout(doInit, 100);
          return;
        }
        initWidget();
      };
      doInit();
    };

    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [initWidget]);

  // Handle NEXT / PREVIOUS dispatches from the reducer.
  // These change currentTrack but don't go through playIndex, so the iframe
  // src hasn't been updated yet. We need to set it here.
  useEffect(() => {
    if (!currentTrack) return;
    // If the loaded URL already matches, skip (playIndex already set the src)
    if (loadedUrlRef.current === currentTrack.permalink_url) return;

    // This is a next/previous action — set iframe src
    loadedUrlRef.current = currentTrack.permalink_url;
    if (localIframeRef.current) {
      localIframeRef.current.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(currentTrack.permalink_url)}&auto_play=true`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack]);

  // On first user interaction, unlock the audio session and try to play.
  // We keep trying on every interaction until the widget actually fires PLAY.
  useEffect(() => {
    const tryPlay = () => {
      unlockAudioSession();
      if (sharedWidgetRef.current) {
        sharedWidgetRef.current.play();
      }
      if (playbackStartedRef.current) {
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
    if (!sharedWidgetRef.current || !currentTrack) return;

    if (state.isPlaying) {
      sharedWidgetRef.current.play();
    } else {
      sharedWidgetRef.current.pause();
    }
  }, [state.isPlaying, currentTrack, sharedWidgetRef]);

  return (
    <iframe
      ref={localIframeRef}
      id="sc-widget"
      width="0"
      height="0"
      allow="autoplay"
      style={{ position: "absolute", width: 0, height: 0, border: "none" }}
    />
  );
}
