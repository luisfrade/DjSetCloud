"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
  type MutableRefObject,
} from "react";
import { Track, PlayerState, PlayerAction, SCWidgetInstance } from "@/types";
import { unlockAudioSession } from "@/lib/audioUnlock";

function getInitialShuffle(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("djsetcloud-shuffle");
  return stored === null ? true : stored === "true";
}

const initialState: PlayerState = {
  tracks: [],
  currentIndex: -1,
  isPlaying: false,
  volume: 80,
  progress: 0,
  duration: 0,
  isLoading: true,
  error: null,
  shuffle: true, // will be overridden by localStorage on mount
  playHistory: [],
};

function pickRandomIndex(total: number, exclude: number): number {
  if (total <= 1) return 0;
  let idx: number;
  do {
    idx = Math.floor(Math.random() * total);
  } while (idx === exclude);
  return idx;
}

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "SET_TRACKS":
      return { ...state, tracks: action.tracks, isLoading: false, error: null };
    case "APPEND_TRACKS":
      return { ...state, tracks: [...state.tracks, ...action.tracks] };
    case "REFRESH_TRACKS": {
      const currentTrack =
        state.currentIndex >= 0 && state.currentIndex < state.tracks.length
          ? state.tracks[state.currentIndex]
          : null;
      if (!currentTrack) {
        return { ...state, tracks: action.tracks, isLoading: false, error: null };
      }
      const newIndex = action.tracks.findIndex((t) => t.id === currentTrack.id);
      if (newIndex !== -1) {
        return { ...state, tracks: action.tracks, currentIndex: newIndex, isLoading: false, error: null };
      }
      return {
        ...state,
        tracks: [...action.tracks, currentTrack],
        currentIndex: action.tracks.length,
        isLoading: false,
        error: null,
      };
    }
    case "PLAY_INDEX":
      return {
        ...state,
        currentIndex: action.index,
        isPlaying: true,
        progress: 0,
        playHistory:
          state.currentIndex >= 0
            ? [...state.playHistory, state.currentIndex]
            : state.playHistory,
      };
    case "SET_PLAYING":
      return { ...state, isPlaying: action.isPlaying };
    case "SET_VOLUME":
      return { ...state, volume: action.volume };
    case "SET_PROGRESS":
      return { ...state, progress: action.progress };
    case "SET_DURATION":
      return { ...state, duration: action.duration };
    case "SET_LOADING":
      return { ...state, isLoading: action.isLoading };
    case "SET_ERROR":
      return { ...state, error: action.error, isLoading: false };
    case "SET_SHUFFLE":
      return { ...state, shuffle: action.shuffle };
    case "NEXT": {
      if (state.shuffle && state.tracks.length > 1) {
        const nextIdx = pickRandomIndex(state.tracks.length, state.currentIndex);
        return {
          ...state,
          currentIndex: nextIdx,
          isPlaying: true,
          progress: 0,
          playHistory: [...state.playHistory, state.currentIndex],
        };
      }
      if (state.currentIndex < state.tracks.length - 1) {
        return {
          ...state,
          currentIndex: state.currentIndex + 1,
          isPlaying: true,
          progress: 0,
          playHistory: [...state.playHistory, state.currentIndex],
        };
      }
      return { ...state, isPlaying: false };
    }
    case "PREVIOUS": {
      if (state.shuffle && state.playHistory.length > 0) {
        const history = [...state.playHistory];
        const prevIdx = history.pop()!;
        return {
          ...state,
          currentIndex: prevIdx,
          isPlaying: true,
          progress: 0,
          playHistory: history,
        };
      }
      if (state.currentIndex > 0) {
        return {
          ...state,
          currentIndex: state.currentIndex - 1,
          isPlaying: true,
          progress: 0,
        };
      }
      return state;
    }
    default:
      return state;
  }
}

/** Build the SC Widget player URL for an iframe src */
function buildWidgetUrl(permalinkUrl: string): string {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(permalinkUrl)}&auto_play=true`;
}

interface PlayerContextValue {
  state: PlayerState;
  widgetRef: MutableRefObject<SCWidgetInstance | null>;
  iframeRef: MutableRefObject<HTMLIFrameElement | null>;
  volumeRef: MutableRefObject<number>;
  loadedUrlRef: MutableRefObject<string | null>;
  pendingTrackRef: MutableRefObject<string | null>;
  setTracks: (tracks: Track[]) => void;
  appendTracks: (tracks: Track[]) => void;
  refreshTracks: (tracks: Track[]) => void;
  playTrack: (track: Track) => void;
  playIndex: (index: number) => void;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  setVolume: (v: number) => void;
  seekTo: (ms: number) => void;
  setShuffle: (s: boolean) => void;
  setProgress: (p: number) => void;
  setDuration: (d: number) => void;
  setIsPlaying: (b: boolean) => void;
  setError: (e: string | null) => void;
  setIsLoading: (b: boolean) => void;
  currentTrack: Track | null;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);
  const widgetRef = useRef<SCWidgetInstance | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const volumeRef = useRef(initialState.volume);
  const tracksRef = useRef(state.tracks);
  const loadedUrlRef = useRef<string | null>(null);
  // Tracks a URL that should play once the widget initialises (first load)
  const pendingTrackRef = useRef<string | null>(null);

  // Keep refs in sync
  volumeRef.current = state.volume;
  tracksRef.current = state.tracks;

  // Load shuffle from localStorage on mount
  useEffect(() => {
    const shuffle = getInitialShuffle();
    dispatch({ type: "SET_SHUFFLE", shuffle });
  }, []);

  const setTracks = useCallback(
    (tracks: Track[]) => dispatch({ type: "SET_TRACKS", tracks }),
    []
  );
  const appendTracks = useCallback(
    (tracks: Track[]) => dispatch({ type: "APPEND_TRACKS", tracks }),
    []
  );
  const refreshTracks = useCallback(
    (tracks: Track[]) => dispatch({ type: "REFRESH_TRACKS", tracks }),
    []
  );

  /**
   * playIndex — the core iOS fix.
   *
   * Instead of calling widget.load() via postMessage (which iOS does not treat
   * as a user gesture), we directly set the iframe's `src` attribute.  Setting
   * `iframe.src` inside a click handler IS a user-initiated navigation, so iOS
   * honours the `auto_play=true` parameter on the SoundCloud player URL.
   *
   * The SoundCloudWidget component listens for iframe load events and
   * re-initialises the widget instance + re-binds events after each src change.
   */
  const playIndex = useCallback(
    (index: number) => {
      // Unlock the iOS audio session inside the gesture handler
      unlockAudioSession();

      dispatch({ type: "PLAY_INDEX", index });

      const track = tracksRef.current[index];
      if (!track) return;

      loadedUrlRef.current = track.permalink_url;

      if (iframeRef.current) {
        // Direct src change — user-initiated navigation for iOS
        iframeRef.current.src = buildWidgetUrl(track.permalink_url);
      } else {
        // Widget not mounted yet — store for later
        pendingTrackRef.current = track.permalink_url;
      }
    },
    []
  );

  const playTrack = useCallback(
    (track: Track) => {
      const index = state.tracks.findIndex((t) => t.id === track.id);
      if (index !== -1) playIndex(index);
    },
    [state.tracks, playIndex]
  );

  const play = useCallback(() => {
    unlockAudioSession();
    dispatch({ type: "SET_PLAYING", isPlaying: true });
    widgetRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: "SET_PLAYING", isPlaying: false });
    widgetRef.current?.pause();
  }, []);

  const next = useCallback(() => dispatch({ type: "NEXT" }), []);
  const previous = useCallback(() => dispatch({ type: "PREVIOUS" }), []);

  const setVolume = useCallback(
    (volume: number) => {
      dispatch({ type: "SET_VOLUME", volume });
      widgetRef.current?.setVolume(volume);
    },
    []
  );
  const seekTo = useCallback(
    (ms: number) => {
      widgetRef.current?.seekTo(ms);
    },
    []
  );
  const setShuffle = useCallback((shuffle: boolean) => {
    dispatch({ type: "SET_SHUFFLE", shuffle });
    if (typeof window !== "undefined") {
      localStorage.setItem("djsetcloud-shuffle", String(shuffle));
    }
  }, []);
  const setProgress = useCallback(
    (progress: number) => dispatch({ type: "SET_PROGRESS", progress }),
    []
  );
  const setDuration = useCallback(
    (duration: number) => dispatch({ type: "SET_DURATION", duration }),
    []
  );
  const setIsPlaying = useCallback(
    (isPlaying: boolean) => dispatch({ type: "SET_PLAYING", isPlaying }),
    []
  );
  const setError = useCallback(
    (error: string | null) => dispatch({ type: "SET_ERROR", error }),
    []
  );
  const setIsLoading = useCallback(
    (isLoading: boolean) => dispatch({ type: "SET_LOADING", isLoading }),
    []
  );

  const currentTrack =
    state.currentIndex >= 0 && state.currentIndex < state.tracks.length
      ? state.tracks[state.currentIndex]
      : null;

  return (
    <PlayerContext.Provider
      value={{
        state,
        widgetRef,
        iframeRef,
        volumeRef,
        loadedUrlRef,
        pendingTrackRef,
        setTracks,
        appendTracks,
        refreshTracks,
        playTrack,
        playIndex,
        play,
        pause,
        next,
        previous,
        setVolume,
        seekTo,
        setShuffle,
        setProgress,
        setDuration,
        setIsPlaying,
        setError,
        setIsLoading,
        currentTrack,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
