"use client";

import { useRef, useCallback } from "react";
import { usePlayer } from "@/context/PlayerContext";
import { formatTime } from "@/lib/formatters";

interface PlayerProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onClockToggle?: () => void;
}

export default function Player({
  onRefresh,
  isRefreshing,
  onClockToggle,
}: PlayerProps) {
  const {
    state,
    currentTrack,
    play,
    pause,
    next,
    previous,
    seekTo,
    setShuffle,
  } = usePlayer();
  const progressBarRef = useRef<HTMLDivElement>(null);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || state.duration === 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const fraction = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      seekTo(fraction);
    },
    [state.duration, seekTo]
  );

  if (!currentTrack) return null;

  const isYouTube = currentTrack.source === "youtube";

  const artworkUrl = currentTrack.artwork_url
    ? isYouTube
      ? currentTrack.artwork_url
      : currentTrack.artwork_url.replace("-large", "-t200x200")
    : null;

  const currentTime = state.duration * state.progress;
  const hasPrev = state.shuffle
    ? state.playHistory.length > 0
    : state.currentIndex > 0;
  const hasNext = state.shuffle
    ? state.tracks.length > 1
    : state.currentIndex < state.tracks.length - 1;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-white/10">
      {/* Progress bar (clickable for scrubbing) */}
      <div
        ref={progressBarRef}
        onClick={handleProgressClick}
        className="h-1.5 bg-white/10 cursor-pointer group hover:h-2.5 transition-all"
      >
        <div
          className="h-full bg-blue-500 transition-[width] duration-200 group-hover:bg-blue-400 relative"
          style={{ width: `${state.progress * 100}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
        {/* Track info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 flex-shrink-0 rounded overflow-hidden bg-white/10">
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={currentTrack.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {currentTrack.title}
            </p>
            <p className="text-xs text-white/50 truncate">
              {currentTrack.user.username}
            </p>
          </div>
          {/* Source link (SC or YT) */}
          <a
            href={currentTrack.permalink_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-shrink-0 p-1.5 transition-colors ${
              isYouTube
                ? "text-white/30 hover:text-red-400"
                : "text-white/30 hover:text-orange-400"
            }`}
            title={isYouTube ? "Open on YouTube" : "Open on SoundCloud"}
            aria-label={isYouTube ? "Open on YouTube" : "Open on SoundCloud"}
          >
            {isYouTube ? (
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
            ) : (
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.1-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.172 1.282c.013.06.045.094.104.094.057 0 .09-.035.104-.094l.194-1.282-.194-1.332c-.014-.057-.047-.094-.104-.094m1.945-1.19c-.068 0-.12.06-.12.126l-.217 2.49.217 2.391c0 .066.052.119.12.119.068 0 .12-.053.12-.12l.243-2.39-.243-2.49c0-.067-.053-.127-.12-.127m.92-.443c-.074 0-.135.065-.135.14l-.202 2.934.202 2.857c0 .075.06.135.135.135.074 0 .135-.06.135-.135l.225-2.857-.225-2.934c0-.075-.06-.14-.135-.14m.905-.298c-.082 0-.15.07-.15.154l-.19 3.232.19 3.09c0 .084.068.148.15.148.08 0 .148-.064.148-.148l.217-3.09-.217-3.232c-.002-.084-.068-.154-.148-.154m.953-.24c-.09 0-.164.078-.164.168l-.176 3.472.176 3.15c0 .09.075.162.164.162.088 0 .162-.072.162-.162l.194-3.15-.194-3.472c0-.09-.074-.168-.162-.168m.964-.18c-.098 0-.176.084-.176.182l-.162 3.652.162 3.18c0 .098.078.176.176.176.096 0 .176-.078.176-.176l.18-3.18-.18-3.652c0-.098-.08-.182-.176-.182m.976-.14c-.107 0-.19.091-.19.196l-.15 3.792.15 3.21c0 .104.083.19.19.19.104 0 .19-.086.19-.19l.168-3.21-.169-3.792c0-.105-.085-.196-.19-.196m1.06-.09c-.114 0-.204.097-.204.21l-.136 3.882.136 3.24c0 .112.09.204.204.204.112 0 .204-.092.204-.204l.15-3.24-.15-3.882c0-.113-.092-.21-.204-.21m1.02-.08c-.122 0-.218.104-.218.224l-.12 3.962.12 3.27c0 .118.096.218.218.218.12 0 .218-.1.218-.218l.135-3.27-.135-3.962c0-.12-.098-.225-.218-.225m1.1-.03c-.13 0-.233.11-.233.238l-.107 3.992.107 3.285c0 .127.103.232.233.232.128 0 .232-.105.232-.232l.12-3.285-.12-3.992c0-.128-.104-.238-.232-.238m1.063-.01c-.138 0-.248.117-.248.252l-.094 4.002.094 3.3c0 .135.11.247.248.247.136 0 .247-.112.247-.247l.105-3.3-.105-4.002c0-.135-.11-.252-.247-.252m1.117.06c-.144 0-.262.123-.262.266l-.08 3.942.08 3.316c0 .143.118.26.262.26.142 0 .26-.117.26-.26l.09-3.316-.09-3.942c0-.143-.118-.266-.26-.266m1.072.01c-.153 0-.275.13-.275.28l-.067 3.932.067 3.33c0 .15.122.274.275.274.15 0 .274-.124.274-.274l.076-3.33-.076-3.932c0-.15-.124-.28-.274-.28m1.103-.14c-.16 0-.291.136-.291.294l-.053 4.072.053 3.346c0 .158.13.288.29.288.16 0 .29-.13.29-.288l.06-3.346-.06-4.072c0-.158-.13-.294-.29-.294m1.67.67c-.24-.675-.855-1.16-1.576-1.16-.186 0-.365.034-.535.094-.16.058-.24.136-.24.28v6.53c0 .15.12.27.268.284.015 0 5.096.002 5.096.002.76 0 1.38-.616 1.38-1.378 0-.76-.62-1.378-1.38-1.378-.234 0-.454.06-.648.168-.157-.748-.825-1.31-1.62-1.31-.326 0-.632.097-.89.264" />
              </svg>
            )}
          </a>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {/* Previous */}
          <button
            onClick={previous}
            disabled={!hasPrev}
            className="p-2 text-white/70 hover:text-white disabled:text-white/20 transition-colors"
            aria-label="Previous"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={state.isPlaying ? pause : play}
            className="p-2 bg-white rounded-full text-gray-900 hover:bg-white/90 transition-colors"
            aria-label={state.isPlaying ? "Pause" : "Play"}
          >
            {state.isPlaying ? (
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Next */}
          <button
            onClick={next}
            disabled={!hasNext}
            className="p-2 text-white/70 hover:text-white disabled:text-white/20 transition-colors"
            aria-label="Next"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
          </button>
        </div>

        {/* Time */}
        <div className="hidden sm:block text-xs text-white/40 tabular-nums w-24 text-center">
          {formatTime(currentTime)} / {formatTime(state.duration)}
        </div>

        {/* Clock mode */}
        {onClockToggle && (
          <button
            onClick={onClockToggle}
            className="p-2 text-white/30 hover:text-blue-400 transition-colors"
            aria-label="Clock mode"
            title="Clock mode"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
        )}

        {/* Shuffle */}
        <button
          onClick={() => setShuffle(!state.shuffle)}
          className={`p-2 transition-colors ${
            state.shuffle
              ? "text-blue-400 hover:text-blue-300"
              : "text-white/30 hover:text-white/50"
          }`}
          aria-label={state.shuffle ? "Disable shuffle" : "Enable shuffle"}
          title={state.shuffle ? "Shuffle on" : "Shuffle off"}
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
          </svg>
        </button>

        {/* Refresh feed */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-2 text-white/30 hover:text-white/70 disabled:text-white/10 transition-colors"
            aria-label="Refresh feed"
            title="Refresh feed"
          >
            <svg
              className={`w-5 h-5 ${isRefreshing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
