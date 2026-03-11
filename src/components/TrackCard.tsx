"use client";

import { Track } from "@/types";
import { formatDuration, formatDate } from "@/lib/formatters";
import { usePlayer } from "@/context/PlayerContext";

interface TrackCardProps {
  track: Track;
  index: number;
}

/* YouTube icon */
function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

/* SoundCloud icon */
function SoundCloudIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.1-.1m-.899.828c-.06 0-.091.037-.104.094L0 14.479l.172 1.282c.013.06.045.094.104.094.057 0 .09-.035.104-.094l.194-1.282-.194-1.332c-.014-.057-.047-.094-.104-.094m1.945-1.19c-.068 0-.12.06-.12.126l-.217 2.49.217 2.391c0 .066.052.119.12.119.068 0 .12-.053.12-.12l.243-2.39-.243-2.49c0-.067-.053-.127-.12-.127m.92-.443c-.074 0-.135.065-.135.14l-.202 2.934.202 2.857c0 .075.06.135.135.135.074 0 .135-.06.135-.135l.225-2.857-.225-2.934c0-.075-.06-.14-.135-.14m.905-.298c-.082 0-.15.07-.15.154l-.19 3.232.19 3.09c0 .084.068.148.15.148.08 0 .148-.064.148-.148l.217-3.09-.217-3.232c-.002-.084-.068-.154-.148-.154m.953-.24c-.09 0-.164.078-.164.168l-.176 3.472.176 3.15c0 .09.075.162.164.162.088 0 .162-.072.162-.162l.194-3.15-.194-3.472c0-.09-.074-.168-.162-.168m.964-.18c-.098 0-.176.084-.176.182l-.162 3.652.162 3.18c0 .098.078.176.176.176.096 0 .176-.078.176-.176l.18-3.18-.18-3.652c0-.098-.08-.182-.176-.182m.976-.14c-.107 0-.19.091-.19.196l-.15 3.792.15 3.21c0 .104.083.19.19.19.104 0 .19-.086.19-.19l.168-3.21-.169-3.792c0-.105-.085-.196-.19-.196m1.06-.09c-.114 0-.204.097-.204.21l-.136 3.882.136 3.24c0 .112.09.204.204.204.112 0 .204-.092.204-.204l.15-3.24-.15-3.882c0-.113-.092-.21-.204-.21m1.02-.08c-.122 0-.218.104-.218.224l-.12 3.962.12 3.27c0 .118.096.218.218.218.12 0 .218-.1.218-.218l.135-3.27-.135-3.962c0-.12-.098-.225-.218-.225m1.1-.03c-.13 0-.233.11-.233.238l-.107 3.992.107 3.285c0 .127.103.232.233.232.128 0 .232-.105.232-.232l.12-3.285-.12-3.992c0-.128-.104-.238-.232-.238m1.063-.01c-.138 0-.248.117-.248.252l-.094 4.002.094 3.3c0 .135.11.247.248.247.136 0 .247-.112.247-.247l.105-3.3-.105-4.002c0-.135-.11-.252-.247-.252m1.117.06c-.144 0-.262.123-.262.266l-.08 3.942.08 3.316c0 .143.118.26.262.26.142 0 .26-.117.26-.26l.09-3.316-.09-3.942c0-.143-.118-.266-.26-.266m1.072.01c-.153 0-.275.13-.275.28l-.067 3.932.067 3.33c0 .15.122.274.275.274.15 0 .274-.124.274-.274l.076-3.33-.076-3.932c0-.15-.124-.28-.274-.28m1.103-.14c-.16 0-.291.136-.291.294l-.053 4.072.053 3.346c0 .158.13.288.29.288.16 0 .29-.13.29-.288l.06-3.346-.06-4.072c0-.158-.13-.294-.29-.294m1.67.67c-.24-.675-.855-1.16-1.576-1.16-.186 0-.365.034-.535.094-.16.058-.24.136-.24.28v6.53c0 .15.12.27.268.284.015 0 5.096.002 5.096.002.76 0 1.38-.616 1.38-1.378 0-.76-.62-1.378-1.38-1.378-.234 0-.454.06-.648.168-.157-.748-.825-1.31-1.62-1.31-.326 0-.632.097-.89.264" />
    </svg>
  );
}

/* Livesets icon (headphones) */
function LivesetsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1a9 9 0 00-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 00-9-9z" />
    </svg>
  );
}

export default function TrackCard({ track, index }: TrackCardProps) {
  const { state, playIndex, play } = usePlayer();
  const isActive = state.currentIndex === index;

  const handleClick = () => {
    if (isActive) {
      play();
    } else {
      playIndex(index);
    }
  };

  const isYouTube = track.source === "youtube";
  const isLivesets = track.source === "livesets";

  const artworkUrl = track.artwork_url
    ? track.source === "soundcloud"
      ? track.artwork_url.replace("-large", "-t200x200")
      : track.artwork_url
    : null;

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-center gap-4 p-4 rounded-lg transition-all text-left
        ${
          isActive
            ? "bg-white/10 border-l-4 border-blue-500"
            : "hover:bg-white/5 border-l-4 border-transparent"
        }`}
    >
      {/* Artwork */}
      <div className="relative w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-white/10">
        {artworkUrl ? (
          <img
            src={artworkUrl}
            alt={track.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
        )}
        {isActive && state.isPlaying && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="flex gap-0.5 items-end h-4">
              <span className="w-1 bg-blue-400 animate-[equalizer_0.5s_ease-in-out_infinite_alternate] h-2" />
              <span className="w-1 bg-blue-400 animate-[equalizer_0.5s_ease-in-out_0.2s_infinite_alternate] h-4" />
              <span className="w-1 bg-blue-400 animate-[equalizer_0.5s_ease-in-out_0.4s_infinite_alternate] h-3" />
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-medium truncate ${isActive ? "text-blue-400" : "text-white"}`}
        >
          {track.title}
        </p>
        <p className="text-xs text-white/50 truncate">{track.user.username}</p>
      </div>

      {/* Duration, Date & Source link */}
      <div className="flex-shrink-0 flex items-center gap-2">
        <div className="text-right">
          <p className="text-xs text-white/40">
            {formatDuration(track.duration)}
          </p>
          <p className="text-xs text-white/30">
            {formatDate(track.created_at)}
          </p>
        </div>
        <a
          href={track.permalink_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`p-1 transition-colors ${
            isYouTube
              ? "text-white/20 hover:text-red-400"
              : isLivesets
                ? "text-white/20 hover:text-green-400"
                : "text-white/20 hover:text-orange-400"
          }`}
          title={isYouTube ? "Open on YouTube" : isLivesets ? "Open on Livesets" : "Open on SoundCloud"}
          aria-label={isYouTube ? "Open on YouTube" : isLivesets ? "Open on Livesets" : "Open on SoundCloud"}
        >
          {isYouTube ? (
            <YouTubeIcon className="w-4 h-4" />
          ) : isLivesets ? (
            <LivesetsIcon className="w-4 h-4" />
          ) : (
            <SoundCloudIcon className="w-4 h-4" />
          )}
        </a>
      </div>
    </button>
  );
}
