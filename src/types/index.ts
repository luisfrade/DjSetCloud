export interface Track {
  id: number;
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
  | { type: "SET_PLAYING"; isPlaying: boolean }
  | { type: "SET_VOLUME"; volume: number }
  | { type: "SET_PROGRESS"; progress: number }
  | { type: "SET_DURATION"; duration: number }
  | { type: "SET_LOADING"; isLoading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_SHUFFLE"; shuffle: boolean }
  | { type: "NEXT" }
  | { type: "PREVIOUS" };

// SoundCloud Widget API types
export interface SCWidgetInstance {
  load(url: string, options?: Record<string, unknown>): void;
  play(): void;
  pause(): void;
  toggle(): void;
  seekTo(milliseconds: number): void;
  setVolume(volume: number): void;
  getVolume(callback: (volume: number) => void): void;
  getDuration(callback: (duration: number) => void): void;
  getPosition(callback: (position: number) => void): void;
  getCurrentSound(callback: (sound: unknown) => void): void;
  isPaused(callback: (paused: boolean) => void): void;
  bind(eventName: string, listener: (data?: unknown) => void): void;
  unbind(eventName: string): void;
}

export interface SCWidgetEvents {
  READY: string;
  PLAY: string;
  PAUSE: string;
  FINISH: string;
  PLAY_PROGRESS: string;
  SEEK: string;
  ERROR: string;
}

declare global {
  interface Window {
    SC: {
      Widget: {
        (iframe: HTMLIFrameElement | string): SCWidgetInstance;
        Events: SCWidgetEvents;
      };
    };
  }
}
