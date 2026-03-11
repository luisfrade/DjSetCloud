"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { TracksResponse } from "@/types";
import Feed from "@/components/Feed";
import Player from "@/components/Player";
import ClockOverlay from "@/components/ClockOverlay";
import YouTubePlayer from "@/components/YouTubePlayer";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_VISIBILITY_REFRESH_MS = 5 * 60 * 1000; // 5 min minimum between refreshes

export default function Home() {
  const {
    setTracks,
    appendTracks,
    refreshTracks,
    playIndex,
    setError,
    setIsLoading,
    cacheStreamUrls,
    preloadStreams,
    preBufferAudio,
  } = usePlayer();
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const initialFetchDone = useRef(false);
  const lastRefreshRef = useRef(Date.now());

  // Fetch initial tracks
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    setIsLoading(true);

    // Send shuffle preference so the server can pick the autoplay track
    // and guarantee its stream URL is pre-resolved in the response.
    const shuffle = localStorage.getItem("djsetcloud-shuffle");
    const isShuffleOn = shuffle === null ? true : shuffle === "true";

    fetch(`/api/tracks?shuffle=${isShuffleOn}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load tracks");
        return res.json();
      })
      .then((data: TracksResponse) => {
        setTracks(data.tracks);
        setNextOffset(data.nextOffset);

        // Seed the stream URL cache with any URLs pre-resolved by the server.
        // This eliminates the /api/stream round-trip for the first tracks.
        if (data.preloadedStreams) {
          cacheStreamUrls(data.preloadedStreams);
        }

        if (data.tracks.length > 0) {
          // Use the server-determined autoplay index — the server already
          // pre-resolved this track's stream URL so playback is near-instant.
          const startIndex = data.autoplayIndex ?? 0;
          const startTrack = data.tracks[startIndex];

          // Start pre-buffering the autoplay track's audio data on a hidden
          // Audio element BEFORE calling playIndex.  When loadAndPlay later
          // sets the same URL on the main Audio element, the browser HTTP
          // cache serves the already-downloading data — drastically reducing
          // time-to-first-play.
          if (startTrack && data.preloadedStreams?.[startTrack.id]) {
            preBufferAudio(startTrack.id, data.preloadedStreams[startTrack.id]);
          }

          playIndex(startIndex);

          // Pre-fetch stream URLs for more tracks in the background
          // so subsequent plays are instant.
          preloadStreams(data.tracks);
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load tracks");
      });
  }, [setTracks, playIndex, setError, setIsLoading, cacheStreamUrls, preloadStreams, preBufferAudio]);

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    lastRefreshRef.current = Date.now();
    fetch("/api/tracks")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to refresh");
        return res.json();
      })
      .then((data: TracksResponse) => {
        refreshTracks(data.tracks);
        setNextOffset(data.nextOffset);
      })
      .catch((err) => {
        console.error("Failed to refresh:", err);
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [isRefreshing, refreshTracks]);

  // Auto-refresh feed every 30 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      handleRefresh();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [handleRefresh]);

  // Refresh when user returns to the tab (if enough time has passed)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefreshRef.current > MIN_VISIBILITY_REFRESH_MS
      ) {
        handleRefresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [handleRefresh]);

  const handleLoadMore = useCallback(() => {
    if (nextOffset === null || isLoadingMore) return;

    setIsLoadingMore(true);
    fetch(`/api/tracks?offset=${nextOffset}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load more tracks");
        return res.json();
      })
      .then((data: TracksResponse) => {
        appendTracks(data.tracks);
        setNextOffset(data.nextOffset);
      })
      .catch((err) => {
        console.error("Failed to load more:", err);
      })
      .finally(() => {
        setIsLoadingMore(false);
      });
  }, [nextOffset, isLoadingMore, appendTracks]);

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-white/10 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg
              className="w-7 h-7 text-white animate-[spin_3s_linear_infinite]"
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
          <h1 className="text-xl font-bold text-white">DjSetCloud</h1>
          <span className="text-xs text-white/30 ml-auto">
            Afro House / House / Techno / Tech House
          </span>
        </div>
      </header>

      {/* Feed */}
      <Feed
        onLoadMore={handleLoadMore}
        hasMore={nextOffset !== null}
        isLoadingMore={isLoadingMore}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Player */}
      <Player
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onClockToggle={() => setShowClock(true)}
      />

      {/* YouTube IFrame Player (hidden) */}
      <YouTubePlayer />

      {/* Clock overlay */}
      {showClock && <ClockOverlay onClose={() => setShowClock(false)} />}
    </div>
  );
}
