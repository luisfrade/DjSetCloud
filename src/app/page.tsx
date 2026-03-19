"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { TracksResponse } from "@/types";
import Feed from "@/components/Feed";
import Player from "@/components/Player";
import ClockOverlay from "@/components/ClockOverlay";
import YouTubePlayer from "@/components/YouTubePlayer";
import SplashScreen from "@/components/SplashScreen";
import SearchFilter from "@/components/SearchFilter";

const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MIN_VISIBILITY_REFRESH_MS = 5 * 60 * 1000; // 5 min minimum between refreshes

export default function Home() {
  const {
    state: playerState,
    setTracks,
    appendTracks,
    refreshTracks,
    setError,
    setIsLoading,
    cacheStreamUrls,
    preloadStreams,
    setPlaybackFilter,
  } = usePlayer();
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeGenre, setActiveGenre] = useState("all");
  const initialFetchDone = useRef(false);
  const lastRefreshRef = useRef(Date.now());
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = playerState.isPlaying;

  // Sync filter state to PlayerContext so navigation respects the active filter
  useEffect(() => {
    setPlaybackFilter({ searchQuery, genre: activeGenre });
  }, [searchQuery, activeGenre, setPlaybackFilter]);

  // Fetch initial tracks (no autoplay — user picks the first track)
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    setIsLoading(true);

    fetch("/api/tracks", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load tracks");
        return res.json();
      })
      .then((data: TracksResponse) => {
        setTracks(data.tracks);
        setNextOffset(data.nextOffset);

        // Seed the stream URL cache with any URLs pre-resolved by the server.
        if (data.preloadedStreams) {
          cacheStreamUrls(data.preloadedStreams);
        }

        // Pre-fetch stream URLs for more tracks in the background
        // so the first user-initiated play is instant.
        if (data.tracks.length > 0) {
          preloadStreams(data.tracks);
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load tracks");
      });
  }, [setTracks, setError, setIsLoading, cacheStreamUrls, preloadStreams]);

  // Register service worker for PWA support
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // 2-minute inactivity timer — show clock overlay when audio is playing
  useEffect(() => {
    const INACTIVITY_MS = 2 * 60 * 1000;

    const resetTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = setTimeout(() => {
        if (isPlayingRef.current) {
          setShowClock(true);
        }
      }, INACTIVITY_MS);
    };

    const events = ["mousemove", "touchstart", "click", "keydown", "scroll"];
    events.forEach((e) =>
      document.addEventListener(e, resetTimer, { passive: true })
    );
    resetTimer();

    return () => {
      events.forEach((e) => document.removeEventListener(e, resetTimer));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, []);

  const isRefreshingRef = useRef(false);

  const handleRefresh = useCallback(() => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    lastRefreshRef.current = Date.now();
    fetch("/api/tracks", { cache: "no-store" })
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
        isRefreshingRef.current = false;
        setIsRefreshing(false);
      });
  }, [refreshTracks]);

  // Robust auto-refresh: combines multiple strategies to ensure the feed
  // is always updated at least every REFRESH_INTERVAL_MS (30 min), even
  // on mobile Safari where setInterval is throttled in background tabs.
  useEffect(() => {
    // 1. Standard interval (works when tab is active/foreground)
    const interval = setInterval(() => {
      if (Date.now() - lastRefreshRef.current >= REFRESH_INTERVAL_MS) {
        handleRefresh();
      }
    }, REFRESH_INTERVAL_MS);

    // 2. Visibility change — fires when returning from background/other app
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefreshRef.current > MIN_VISIBILITY_REFRESH_MS
      ) {
        handleRefresh();
      }
    };

    // 3. Focus — catches cases where visibilitychange doesn't fire (some
    //    mobile browsers, PWA returning to foreground)
    const onFocus = () => {
      if (Date.now() - lastRefreshRef.current > MIN_VISIBILITY_REFRESH_MS) {
        handleRefresh();
      }
    };

    // 4. Short-interval watchdog — every 5 min, check if a refresh is overdue.
    //    This catches the mobile Safari case where the main interval was
    //    throttled/paused but the tab is now active again.
    const watchdog = setInterval(() => {
      if (Date.now() - lastRefreshRef.current >= REFRESH_INTERVAL_MS) {
        handleRefresh();
      }
    }, 5 * 60 * 1000);

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [handleRefresh]);

  const handleLoadMore = useCallback(() => {
    if (nextOffset === null || isLoadingMore) return;

    setIsLoadingMore(true);
    fetch(`/api/tracks?offset=${nextOffset}`, { cache: "no-store" })
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
      {/* Hide page content while splash is visible to prevent iPad Safari flash */}
      <div
        className="flex flex-col flex-1 min-h-0"
        style={showSplash ? { visibility: "hidden" } : undefined}
      >
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
        </div>
      </header>

      {/* Search & Genre Filters */}
      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeGenre={activeGenre}
        onGenreChange={setActiveGenre}
      />

      {/* Feed */}
      <Feed
        onLoadMore={handleLoadMore}
        hasMore={nextOffset !== null}
        isLoadingMore={isLoadingMore}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        searchQuery={searchQuery}
        activeGenre={activeGenre}
      />

      {/* Player */}
      <Player
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        onClockToggle={() => setShowClock(true)}
      />

      {/* YouTube IFrame Player (hidden) */}
      <YouTubePlayer />
      </div>

      {/* Clock overlay */}
      {showClock && <ClockOverlay onClose={() => setShowClock(false)} />}

      {/* Splash / loading screen */}
      {showSplash && (
        <SplashScreen
          isLoaded={!playerState.isLoading}
          onComplete={() => setShowSplash(false)}
        />
      )}
    </div>
  );
}
