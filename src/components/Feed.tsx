"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { usePlayer } from "@/context/PlayerContext";
import TrackCard from "./TrackCard";

interface FeedProps {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  searchQuery: string;
  activeGenre: string;
}

const PULL_THRESHOLD = 80; // px the user must drag to trigger refresh

export default function Feed({
  onLoadMore,
  hasMore,
  isLoadingMore,
  onRefresh,
  isRefreshing,
  searchQuery,
  activeGenre,
}: FeedProps) {
  const { state } = usePlayer();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);

  // ——— Infinite scroll via IntersectionObserver ———
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollRef.current;
    if (!sentinel || !container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      { root: container, rootMargin: "400px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, onLoadMore]);

  // ——— Pull-to-refresh touch handlers ———
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!scrollRef.current || isRefreshing) return;
      // Only activate when scrolled to the very top
      if (scrollRef.current.scrollTop <= 0) {
        touchStartY.current = e.touches[0].clientY;
        setPulling(true);
      }
    },
    [isRefreshing]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartY.current === null || !pulling || isRefreshing) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0) {
        // Dampen the pull distance for a nicer feel
        setPullDistance(Math.min(dy * 0.5, 120));
      } else {
        // User scrolled up — cancel pull
        touchStartY.current = null;
        setPulling(false);
        setPullDistance(0);
      }
    },
    [pulling, isRefreshing]
  );

  const onTouchEnd = useCallback(() => {
    if (touchStartY.current === null) return;
    if (pullDistance >= PULL_THRESHOLD && onRefresh && !isRefreshing) {
      onRefresh();
    }
    touchStartY.current = null;
    setPulling(false);
    setPullDistance(0);
  }, [pullDistance, onRefresh, isRefreshing]);

  // ——— Client-side filtering (preserves original indices for playback) ———
  // Must be above early returns to satisfy Rules of Hooks
  const isFiltered = searchQuery.trim() !== "" || activeGenre !== "all";

  const filteredTracks = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const genre = activeGenre.toLowerCase();

    return state.tracks
      .map((track, originalIndex) => ({ track, originalIndex }))
      .filter(({ track }) => {
        // Genre filter
        if (genre !== "all") {
          const trackGenre = (track.genre || "").toLowerCase();
          if (!trackGenre.includes(genre)) return false;
        }
        // Search filter
        if (query) {
          const title = track.title.toLowerCase();
          const artist = track.user.username.toLowerCase();
          if (!title.includes(query) && !artist.includes(query)) return false;
        }
        return true;
      });
  }, [state.tracks, searchQuery, activeGenre]);

  if (state.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-white/50">Loading DJ sets...</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center px-4">
          <p className="text-red-400 text-sm">{state.error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (state.tracks.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-white/50 text-sm">
          No DJ sets found. Check back later.
        </p>
      </div>
    );
  }

  const pastThreshold = pullDistance >= PULL_THRESHOLD;

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto pb-28"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: pulling || isRefreshing ? `${Math.max(pullDistance, isRefreshing ? 48 : 0)}px` : "0px" }}
      >
        <div className="flex items-center gap-2 text-white/40 text-sm py-2">
          {isRefreshing ? (
            <>
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span>Refreshing...</span>
            </>
          ) : pastThreshold ? (
            <>
              <svg className="w-4 h-4 rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <span>Release to refresh</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <span>Pull to refresh</span>
            </>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-1">
        {/* Result count when filtering */}
        {isFiltered && filteredTracks.length > 0 && (
          <p className="text-xs text-white/30 pb-2">
            Showing {filteredTracks.length} of {state.tracks.length} sets
          </p>
        )}

        {/* Filtered track list — originalIndex preserves playback correctness */}
        {filteredTracks.map(({ track, originalIndex }) => (
          <TrackCard key={track.id} track={track} index={originalIndex} />
        ))}

        {/* Empty filter state */}
        {isFiltered && filteredTracks.length === 0 && state.tracks.length > 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <svg className="w-10 h-10 text-white/15" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <p className="text-sm text-white/40">No sets match your search</p>
          </div>
        )}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />

        {isLoadingMore && (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
