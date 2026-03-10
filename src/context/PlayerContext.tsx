"use client";

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import { Track, PlayerState, PlayerAction } from "@/types";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitialShuffle(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem("djsetcloud-shuffle");
  return stored === null ? true : stored === "true";
}

function pickRandomIndex(total: number, exclude: number): number {
  if (total <= 1) return 0;
  let idx: number;
  do {
    idx = Math.floor(Math.random() * total);
  } while (idx === exclude);
  return idx;
}

/* ------------------------------------------------------------------ */
/*  Reducer                                                            */
/* ------------------------------------------------------------------ */

const initialState: PlayerState = {
  tracks: [],
  currentIndex: -1,
  isPlaying: false,
  volume: 80,
  progress: 0,
  duration: 0,
  isLoading: true,
  error: null,
  shuffle: true,
  playHistory: [],
};

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
        return {
          ...state,
          tracks: action.tracks,
          isLoading: false,
          error: null,
        };
      }
      const newIndex = action.tracks.findIndex(
        (t) => t.id === currentTrack.id
      );
      if (newIndex !== -1) {
        return {
          ...state,
          tracks: action.tracks,
          currentIndex: newIndex,
          isLoading: false,
          error: null,
        };
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
        error: null,
        playHistory:
          state.currentIndex >= 0
            ? [...state.playHistory, state.currentIndex]
            : state.playHistory,
      };

    case "PLAY_PREV_INDEX":
      return {
        ...state,
        currentIndex: action.index,
        isPlaying: true,
        progress: 0,
        error: null,
        playHistory: state.playHistory.slice(0, -1),
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
    default:
      return state;
  }
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface PlayerContextValue {
  state: PlayerState;
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
  seekTo: (fraction: number) => void;
  setShuffle: (s: boolean) => void;
  setProgress: (p: number) => void;
  setDuration: (d: number) => void;
  setIsPlaying: (b: boolean) => void;
  setError: (e: string | null) => void;
  setIsLoading: (b: boolean) => void;
  currentTrack: Track | null;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);

  /* ---- refs ---- */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tracksRef = useRef(state.tracks);
  const stateRef = useRef(state);
  const volumeRef = useRef(initialState.volume);
  const consecutiveErrorsRef = useRef(0);
  const isResolvingRef = useRef(false);

  // Keep refs in sync
  tracksRef.current = state.tracks;
  stateRef.current = state;
  volumeRef.current = state.volume;

  /* ---- Create Audio element + Web Audio gain node (once) ---- */
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    // crossOrigin needed for Web Audio API createMediaElementSource
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    // Set up Web Audio API for software volume control (iOS needs this)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const source = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        source.connect(gain);
        gain.connect(ctx.destination);

        audioCtxRef.current = ctx;
        gainNodeRef.current = gain;
        gain.gain.value = volumeRef.current / 100;
      }
    } catch (err) {
      console.warn(
        "Web Audio setup failed — falling back to audio.volume:",
        err
      );
    }

    // Fallback volume for non-iOS browsers
    audio.volume = volumeRef.current / 100;

    /* ---- Audio event listeners ---- */
    const onTimeUpdate = () => {
      if (audio.duration > 0 && isFinite(audio.duration)) {
        dispatch({
          type: "SET_PROGRESS",
          progress: audio.currentTime / audio.duration,
        });
      }
    };

    const onDurationChange = () => {
      if (audio.duration > 0 && isFinite(audio.duration)) {
        dispatch({
          type: "SET_DURATION",
          duration: audio.duration * 1000, // seconds → ms
        });
      }
    };

    const onPlay = () => {
      consecutiveErrorsRef.current = 0;
      dispatch({ type: "SET_PLAYING", isPlaying: true });
    };

    const onPause = () => {
      // Ignore pause events while we're resolving a new stream
      if (!isResolvingRef.current) {
        dispatch({ type: "SET_PLAYING", isPlaying: false });
      }
    };

    const onEnded = () => {
      nextRef.current();
    };

    const onError = () => {
      if (!audio.src || audio.src === "") return; // ignore empty src errors
      console.error("Audio playback error:", audio.error?.message);
      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current <= 3) {
        setTimeout(() => nextRef.current(), 800);
      } else {
        dispatch({ type: "SET_PLAYING", isPlaying: false });
        dispatch({
          type: "SET_ERROR",
          error: "Playback error. Try another track.",
        });
      }
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
      audioCtxRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Load shuffle preference from localStorage ---- */
  useEffect(() => {
    const shuffle = getInitialShuffle();
    dispatch({ type: "SET_SHUFFLE", shuffle });
  }, []);

  /* ---- Simple dispatchers ---- */
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

  /* ---- Volume ---- */
  const setVolume = useCallback((volume: number) => {
    dispatch({ type: "SET_VOLUME", volume });
    const v = volume / 100;
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = v;
    }
    if (audioRef.current) {
      audioRef.current.volume = v;
    }
  }, []);

  /* ---- Shuffle ---- */
  const setShuffle = useCallback((shuffle: boolean) => {
    dispatch({ type: "SET_SHUFFLE", shuffle });
    if (typeof window !== "undefined") {
      localStorage.setItem("djsetcloud-shuffle", String(shuffle));
    }
  }, []);

  /* ---- Seek (fraction 0–1) ---- */
  const seekTo = useCallback((fraction: number) => {
    const audio = audioRef.current;
    if (audio && audio.duration > 0 && isFinite(audio.duration)) {
      audio.currentTime = fraction * audio.duration;
    }
  }, []);

  /* ---- Resume AudioContext (required on iOS before playback) ---- */
  const resumeAudioContext = useCallback(() => {
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }
  }, []);

  /* ---- Core: resolve stream URL & play ---- */
  const loadAndPlay = useCallback(async (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;

    isResolvingRef.current = true;

    try {
      const res = await fetch(
        `/api/stream?id=${encodeURIComponent(track.id)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ||
            `Stream resolution HTTP ${res.status}`
        );
      }
      const data = await res.json();
      if (!data.url) throw new Error("Empty stream URL");

      audio.src = data.url;
      audio.volume = volumeRef.current / 100;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = volumeRef.current / 100;
      }

      isResolvingRef.current = false;

      await audio.play();
    } catch (err) {
      isResolvingRef.current = false;
      console.warn("loadAndPlay failed:", err);
      dispatch({ type: "SET_PLAYING", isPlaying: false });
      throw err; // let caller handle
    }
  }, []);

  /* ---- playIndex (user gesture → load + play) ---- */
  const playIndex = useCallback(
    async (index: number) => {
      resumeAudioContext();
      dispatch({ type: "PLAY_INDEX", index });

      const track = tracksRef.current[index];
      if (!track) return;

      try {
        await loadAndPlay(track);
      } catch {
        // loadAndPlay already sets isPlaying=false
      }
    },
    [loadAndPlay, resumeAudioContext]
  );

  /* ---- playTrack ---- */
  const playTrack = useCallback(
    (track: Track) => {
      const index = stateRef.current.tracks.findIndex(
        (t) => t.id === track.id
      );
      if (index !== -1) playIndex(index);
    },
    [playIndex]
  );

  /* ---- play / pause ---- */
  const play = useCallback(() => {
    resumeAudioContext();
    dispatch({ type: "SET_PLAYING", isPlaying: true });
    audioRef.current?.play().catch(() => {
      dispatch({ type: "SET_PLAYING", isPlaying: false });
    });
  }, [resumeAudioContext]);

  const pause = useCallback(() => {
    dispatch({ type: "SET_PLAYING", isPlaying: false });
    audioRef.current?.pause();
  }, []);

  /* ---- next / previous ---- */
  const next = useCallback(() => {
    const s = stateRef.current;
    resumeAudioContext();

    if (s.shuffle && s.tracks.length > 1) {
      const nextIdx = pickRandomIndex(s.tracks.length, s.currentIndex);
      dispatch({ type: "PLAY_INDEX", index: nextIdx });
      const track = s.tracks[nextIdx];
      if (track) loadAndPlay(track).catch(() => {});
    } else if (s.currentIndex < s.tracks.length - 1) {
      const nextIdx = s.currentIndex + 1;
      dispatch({ type: "PLAY_INDEX", index: nextIdx });
      const track = s.tracks[nextIdx];
      if (track) loadAndPlay(track).catch(() => {});
    } else {
      dispatch({ type: "SET_PLAYING", isPlaying: false });
      audioRef.current?.pause();
    }
  }, [loadAndPlay, resumeAudioContext]);

  const previous = useCallback(() => {
    const s = stateRef.current;
    resumeAudioContext();

    if (s.shuffle && s.playHistory.length > 0) {
      const prevIdx = s.playHistory[s.playHistory.length - 1];
      dispatch({ type: "PLAY_PREV_INDEX", index: prevIdx });
      const track = s.tracks[prevIdx];
      if (track) loadAndPlay(track).catch(() => {});
    } else if (s.currentIndex > 0) {
      const prevIdx = s.currentIndex - 1;
      dispatch({ type: "PLAY_INDEX", index: prevIdx });
      const track = s.tracks[prevIdx];
      if (track) loadAndPlay(track).catch(() => {});
    }
  }, [loadAndPlay, resumeAudioContext]);

  /* ---- Stable ref for next(), used inside audio "ended" handler ---- */
  const nextRef = useRef(next);
  nextRef.current = next;

  /* ---- Derived ---- */
  const currentTrack =
    state.currentIndex >= 0 && state.currentIndex < state.tracks.length
      ? state.tracks[state.currentIndex]
      : null;

  return (
    <PlayerContext.Provider
      value={{
        state,
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
