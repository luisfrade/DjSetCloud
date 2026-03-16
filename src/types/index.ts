export interface Track {
  id: string; // "sc-{numericId}" or "yt-{videoId}"
  source: "soundcloud" | "youtube" | "livesets" | "sc-following";
  title: string;
  permalink_url: string;
  artwork_url: string | null;
  duration: number; // milliseconds
  created_at: string; // ISO date
  genre: string;
  user: {
    username: string;
    avatar_url: string;
  };
}

export interface TracksResponse {
  tracks: Track[];
  nextOffset: number | null;
  /** Pre-resolved stream URLs for the first few audio tracks (keyed by track id). */
  preloadedStreams?: Record<string, string>;
}

export interface PlayerState {
  tracks: Track[];
  currentIndex: number;
  isPlaying: boolean;
  volume: number; // 0-100
  progress: number; // 0-1
  duration: number; // ms
  isLoading: boolean;
  error: string | null;
  shuffle: boolean;
  playHistory: number[]; // stack of previously played indices (for back in shuffle)
}

export type PlayerAction =
  | { type: "SET_TRACKS"; tracks: Track[] }
  | { type: "APPEND_TRACKS"; tracks: Track[] }
  | { type: "REFRESH_TRACKS"; tracks: Track[] }
  | { type: "PLAY_INDEX"; index: number }
  | { type: "PLAY_PREV_INDEX"; index: number }
  | { type: "SET_PLAYING"; isPlaying: boolean }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "SET_PROGRESS"; progress: number }
  | { type: "SET_DURATION"; duration: number }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_SHUFFLE"; shuffle: boolean };

/** Subset of YouTube IFrame Player API methods we use */
export interface YTPlayer {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void; // 0-100
  getVolume(): number;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  destroy(): void;
}
