"use client";

import { usePlayer } from "@/context/PlayerContext";
import TrackCard from "./TrackCard";

interface FeedProps {
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
}

export default function Feed({ onLoadMore, hasMore, isLoadingMore }: FeedProps) {
  const { state } = usePlayer();

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
        <p className="text-white/50 text-sm">No DJ sets found. Check back later.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pb-28">
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-1">
        {state.tracks.map((track, index) => (
          <TrackCard key={track.id} track={track} index={index} />
        ))}

        {hasMore && (
          <div className="flex justify-center pt-4 pb-8">
            <button
              onClick={onLoadMore}
              disabled={isLoadingMore}
              className="px-6 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 rounded-lg text-sm transition-colors"
            >
              {isLoadingMore ? "Loading..." : "Load More"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
