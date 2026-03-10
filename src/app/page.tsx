"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { TracksResponse } from "@/types";
import Feed from "@/components/Feed";
import Player from "@/components/Player";
import SoundCloudWidget from "@/components/SoundCloudWidget";
import ClockOverlay from "@/components/ClockOverlay";

export default function Home() {
  const { setTracks, appendTracks, refreshTracks, playIndex, setError, setIsLoading } =
    usePlayer();
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showClock, setShowClock] = useState(false);
  const initialFetchDone = useRef(false);

  // Fetch initial tracks
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;

    setIsLoading(true);

    fetch("/api/tracks")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load tracks");
        return res.json();
      })
      .then((data: TracksResponse) => {
        setTracks(data.tracks);
        setNextOffset(data.nextOffset);
        // Auto-play: random track if shuffle on, otherwise first (newest)
        if (data.tracks.length > 0) {
          const shuffle = localStorage.getItem("djsetcloud-shuffle");
          const isShuffleOn = shuffle === null ? true : shuffle === "true";
          const startIndex = isShuffleOn
            ? Math.floor(Math.random() * data.tracks.length)
            : 0;
          playIndex(startIndex);
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to load tracks");
      });
  }, [setTracks, playIndex, setError, setIsLoading]);

  const handleRefresh = useCallback(() => {
    if (isRefreshing) return;
    setIsRefreshing(true);
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
              {/* Outer ring */}
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none" />
              {/* Grooves */}
              <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.5" fill="none" />
              <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="0.5" strokeOpacity="0.5" fill="none" />
              {/* Center label */}
              <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.3" />
              {/* Center hole */}
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

      {/* Hidden SoundCloud Widget */}
      <SoundCloudWidget />

      {/* Clock overlay */}
      {showClock && <ClockOverlay onClose={() => setShowClock(false)} />}
    </div>
  );
}
