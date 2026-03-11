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
import { Track, PlayerState, PlayerAction, YTPlayer } from "@/types";

/* ------------------------------------------------------------------ */
/*  iOS Safari audio unlock                                            */
/* ------------------------------------------------------------------ */

/**
 * Tiny silent WAV (mono, 44100 Hz, 16-bit, 2 samples of silence).
 * Playing this from a user gesture "activates" the HTML5 Audio element
 * on iOS Safari, so a later programmatic play() (after an async fetch)
 * is allowed. Without this, iOS blocks audio.play() calls that happen
 * outside the synchronous call-stack of a user interaction.
 */
const SILENCE_DATA_URI =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==";

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
  /** Seed the stream URL cache with pre-resolved URLs (e.g. from API response). */
  cacheStreamUrls: (map: Record<string, string>) => void;
  /** Fire background fetches for the given tracks' stream URLs. */
  preloadStreams: (tracks: Track[]) => void;
  /* YouTube IFrame Player integration */
  onYTReady: (player: YTPlayer) => void;
  onYTStateChange: (ytState: number) => void;
  onYTError: () => void;
  onYTProgress: (currentTime: number, duration: number) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(playerReducer, initialState);

  /* ---- refs ---- */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const activeEngineRef = useRef<"audio" | "youtube">("audio");
  const pendingYTLoadRef = useRef<string | null>(null);

  const tracksRef = useRef(state.tracks);
  const stateRef = useRef(state);
  const volumeRef = useRef(initialState.volume);
  const consecutiveErrorsRef = useRef(0);
  const isResolvingRef = useRef(false);

  /**
   * Client-side stream URL cache.
   * Stores either a resolved URL (string) or a pending fetch (Promise<string>).
   * Used by loadAndPlay to skip the /api/stream round-trip when the URL
   * was pre-resolved server-side or pre-fetched in the background.
   */
  const streamCacheRef = useRef(new Map<string, string | Promise<string>>());

  /**
   * Pool of hidden Audio elements that pre-buffer audio data for the
   * tracks most likely to be played next.  When loadAndPlay later sets
   * the same URL on the main audio element, the browser's HTTP cache
   * provides the data near-instantly.
   */
  const preloadPoolRef = useRef<HTMLAudioElement[]>([]);

  // Keep refs in sync
  tracksRef.current = state.tracks;
  stateRef.current = state;
  volumeRef.current = state.volume;

  /* ---- Create Audio element (once) ---- */
  /* NO crossOrigin, NO Web Audio API / createMediaElementSource.       */
  /* This fixes iOS Safari where AudioContext starts suspended and      */
  /* blocks all audio routed through it.                                */
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;
    audio.volume = volumeRef.current / 100;

    /* ---- Audio event listeners ---- */
    const onTimeUpdate = () => {
      if (activeEngineRef.current !== "audio") return;
      if (audio.duration > 0 && isFinite(audio.duration)) {
        dispatch({
          type: "SET_PROGRESS",
          progress: audio.currentTime / audio.duration,
        });
      }
    };

    const onDurationChange = () => {
      if (activeEngineRef.current !== "audio") return;
      if (audio.duration > 0 && isFinite(audio.duration)) {
        dispatch({
          type: "SET_DURATION",
          duration: audio.duration * 1000, // seconds → ms
        });
      }
    };

    const onPlay = () => {
      if (activeEngineRef.current !== "audio") return;
      consecutiveErrorsRef.current = 0;
      dispatch({ type: "SET_PLAYING", isPlaying: true });
    };

    const onPause = () => {
      if (activeEngineRef.current !== "audio") return;
      // Ignore pause events while we're resolving a new stream
      if (!isResolvingRef.current) {
        dispatch({ type: "SET_PLAYING", isPlaying: false });
      }
    };

    const onEnded = () => {
      if (activeEngineRef.current !== "audio") return;
      // Ignore ended events during warm-up / stream resolution
      // (e.g. the tiny silence clip ending before the real track loads)
      if (isResolvingRef.current) return;
      nextRef.current();
    };

    const onError = () => {
      if (activeEngineRef.current !== "audio") return;
      if (!audio.src || audio.src === "") return; // ignore empty src errors
      if (isResolvingRef.current) return; // ignore errors during warm-up
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Pre-buffer audio pool (hidden elements for adjacent tracks) ---- */
  useEffect(() => {
    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < 3; i++) {
      const a = new Audio();
      a.preload = "auto";
      a.volume = 0; // silent — only used for pre-buffering
      pool.push(a);
    }
    preloadPoolRef.current = pool;

    return () => {
      for (const a of pool) {
        a.pause();
        a.removeAttribute("src");
        a.load();
      }
    };
  }, []);

  /* ---- Load shuffle preference from localStorage ---- */
  useEffect(() => {
    const shuffle = getInitialShuffle();
    dispatch({ type: "SET_SHUFFLE", shuffle });
  }, []);

  /* ---- Simple dispatchers ---- */
  const setTracks = useCallback(
    (tracks: Track[]) => {
      // Update ref eagerly so that a playIndex() call in the same
      // synchronous block (e.g. page.tsx auto-play) can read the new tracks
      // before React re-renders and syncs the ref.
      tracksRef.current = tracks;
      dispatch({ type: "SET_TRACKS", tracks });
    },
    []
  );
  const appendTracks = useCallback(
    (tracks: Track[]) => {
      tracksRef.current = [...tracksRef.current, ...tracks];
      dispatch({ type: "APPEND_TRACKS", tracks });
    },
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

  /* ---- Volume — update both engines ---- */
  const setVolume = useCallback((volume: number) => {
    dispatch({ type: "SET_VOLUME", volume });
    // HTML5 Audio uses 0–1 range
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
    // YT Player uses 0–100 range
    try {
      ytPlayerRef.current?.setVolume(volume);
    } catch {
      /* player not ready */
    }
  }, []);

  /* ---- Shuffle ---- */
  const setShuffle = useCallback((shuffle: boolean) => {
    dispatch({ type: "SET_SHUFFLE", shuffle });
    if (typeof window !== "undefined") {
      localStorage.setItem("djsetcloud-shuffle", String(shuffle));
    }
  }, []);

  /* ---- Stream URL cache helpers ---- */

  /** Seed the cache with URLs that were pre-resolved server-side. */
  const cacheStreamUrls = useCallback((map: Record<string, string>) => {
    for (const [id, url] of Object.entries(map)) {
      streamCacheRef.current.set(id, url);
    }
  }, []);

  /**
   * Fire background fetches for the given tracks' stream URLs.
   * Resolved URLs are stored in the cache so loadAndPlay can skip the
   * /api/stream round-trip.  Only non-YouTube tracks are preloaded.
   */
  const preloadStreams = useCallback((tracks: Track[]) => {
    const audioTracks = tracks.filter((t) => t.source !== "youtube");
    // Preload up to 8 tracks beyond whatever the server already cached
    const toPreload = audioTracks
      .filter((t) => !streamCacheRef.current.has(t.id))
      .slice(0, 8);

    for (const track of toPreload) {
      const promise = fetch(`/api/stream?id=${encodeURIComponent(track.id)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: { url?: string }) => {
          const url = data.url;
          if (!url) throw new Error("Empty stream URL");
          // Replace promise with resolved string for instant access
          streamCacheRef.current.set(track.id, url);
          return url;
        })
        .catch((err) => {
          // Remove failed entry so loadAndPlay falls back to a fresh fetch
          streamCacheRef.current.delete(track.id);
          throw err;
        });

      streamCacheRef.current.set(track.id, promise);
    }
  }, []);

  /* ---- Seek (fraction 0–1) — route to active engine ---- */
  const seekTo = useCallback((fraction: number) => {
    if (activeEngineRef.current === "youtube") {
      const ytp = ytPlayerRef.current;
      if (ytp) {
        try {
          const dur = ytp.getDuration();
          if (dur > 0) ytp.seekTo(fraction * dur, true);
        } catch {
          /* not ready */
        }
      }
    } else {
      const audio = audioRef.current;
      if (audio && audio.duration > 0 && isFinite(audio.duration)) {
        audio.currentTime = fraction * audio.duration;
      }
    }
  }, []);

  /* ---- Helper: fetch a fresh stream URL from the API ---- */
  const freshStreamFetch = useCallback(async (trackId: string): Promise<string> => {
    const res = await fetch(`/api/stream?id=${encodeURIComponent(trackId)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(
        (data as { error?: string }).error ||
          `Stream resolution HTTP ${res.status}`
      );
    }
    const data = await res.json();
    if (!data.url) throw new Error("Empty stream URL");
    // Cache for potential reuse (e.g. play → pause → play)
    streamCacheRef.current.set(trackId, data.url);
    return data.url;
  }, []);

  /* ---- Core: load track on the correct engine ---- */
  const loadAndPlay = useCallback(async (track: Track) => {
    isResolvingRef.current = true;

    if (track.source === "youtube") {
      /* ---- YouTube: use IFrame Player ---- */

      // Stop the HTML5 Audio engine
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      activeEngineRef.current = "youtube";

      const videoId = track.id.replace("yt-", "");
      const ytp = ytPlayerRef.current;

      if (ytp) {
        try {
          ytp.setVolume(volumeRef.current);
          ytp.loadVideoById(videoId);
        } catch {
          isResolvingRef.current = false;
          dispatch({ type: "SET_PLAYING", isPlaying: false });
        }
      } else {
        // YT player not ready yet — queue for when onYTReady fires
        pendingYTLoadRef.current = videoId;
      }
    } else {
      /* ---- SoundCloud / Livesets: use HTML5 Audio ---- */

      // Stop the YT engine
      try {
        ytPlayerRef.current?.pauseVideo();
      } catch {
        /* ignore */
      }
      activeEngineRef.current = "audio";

      const audio = audioRef.current;
      if (!audio) {
        isResolvingRef.current = false;
        return;
      }

      // Check if the stream URL is already cached (pre-resolved by server
      // or pre-fetched in the background). A cached *string* means we can
      // set the src synchronously — best for iOS because there's no async
      // gap between the user gesture and audio.play().
      const cached = streamCacheRef.current.get(track.id);

      if (typeof cached === "string") {
        /* ---- Fast path: URL available synchronously ---- */
        audio.src = cached;
        audio.volume = volumeRef.current / 100;
        isResolvingRef.current = false;

        try {
          await audio.play();
          return;
        } catch (err) {
          // Cached URL may be stale — clear and try fresh
          streamCacheRef.current.delete(track.id);
          console.warn("Cached URL failed, retrying fresh:", err);
          isResolvingRef.current = true;
        }
      }

      // iOS Safari fix: "activate" the Audio element in the user gesture
      // context BEFORE the async stream-resolution fetch. We play a tiny
      // silence clip synchronously in the gesture call-stack; this tells
      // iOS that a user interaction intends to produce audio, so the
      // subsequent programmatic play() after the fetch is permitted.
      if (typeof cached !== "string") {
        audio.src = SILENCE_DATA_URI;
        audio.play().catch(() => {});
      }

      try {
        let streamUrl: string;

        // If a preload promise is in flight, await it (no duplicate fetch)
        if (cached && typeof cached !== "string") {
          try {
            streamUrl = await cached;
          } catch {
            streamCacheRef.current.delete(track.id);
            streamUrl = await freshStreamFetch(track.id);
          }
        } else {
          streamUrl = await freshStreamFetch(track.id);
        }

        audio.src = streamUrl;
        audio.volume = volumeRef.current / 100;
        isResolvingRef.current = false;

        await audio.play();
      } catch (err) {
        isResolvingRef.current = false;
        console.warn("loadAndPlay failed:", err);
        dispatch({ type: "SET_PLAYING", isPlaying: false });
        throw err; // let caller handle
      }
    }
  }, [freshStreamFetch]);

  /* ---- playIndex (user gesture → load + play) ---- */
  const playIndex = useCallback(
    async (index: number) => {
      dispatch({ type: "PLAY_INDEX", index });

      const track = tracksRef.current[index];
      if (!track) return;

      try {
        await loadAndPlay(track);
      } catch {
        // loadAndPlay already sets isPlaying=false
      }
    },
    [loadAndPlay]
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

  /* ---- play / pause — route to active engine ---- */
  const play = useCallback(() => {
    dispatch({ type: "SET_PLAYING", isPlaying: true });

    if (activeEngineRef.current === "youtube") {
      try {
        ytPlayerRef.current?.playVideo();
      } catch {
        /* ignore */
      }
    } else {
      const audio = audioRef.current;
      if (!audio) {
        dispatch({ type: "SET_PLAYING", isPlaying: false });
        return;
      }
      audio.play().catch(() => {
        // On iOS, a play() may occasionally fail if the audio element
        // lost its "activated" state (e.g. after long backgrounding).
        // Retry once after a brief delay as the gesture may still be valid.
        setTimeout(() => {
          audio.play().catch(() => {
            dispatch({ type: "SET_PLAYING", isPlaying: false });
          });
        }, 150);
      });
    }
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: "SET_PLAYING", isPlaying: false });

    if (activeEngineRef.current === "youtube") {
      try {
        ytPlayerRef.current?.pauseVideo();
      } catch {
        /* ignore */
      }
    } else {
      audioRef.current?.pause();
    }
  }, []);

  /* ---- next / previous ---- */
  const next = useCallback(() => {
    const s = stateRef.current;

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
      if (activeEngineRef.current === "youtube") {
        try {
          ytPlayerRef.current?.pauseVideo();
        } catch {
          /* ignore */
        }
      } else {
        audioRef.current?.pause();
      }
    }
  }, [loadAndPlay]);

  const previous = useCallback(() => {
    const s = stateRef.current;

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
  }, [loadAndPlay]);

  /* ---- Stable ref for next(), used inside audio "ended" handler ---- */
  const nextRef = useRef(next);
  nextRef.current = next;

  /* ---------------------------------------------------------------- */
  /*  Rolling pre-buffer: keep adjacent tracks warm                    */
  /*                                                                   */
  /*  When the current track changes we determine which tracks are     */
  /*  most likely to be played next, resolve their stream URLs, and    */
  /*  start downloading their audio data on hidden Audio elements.     */
  /*  When loadAndPlay later sets the same URL on the main audio, the  */
  /*  browser's HTTP cache provides the data near-instantly.            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const { currentIndex, tracks, shuffle, playHistory } = stateRef.current;
    if (currentIndex < 0 || tracks.length === 0) return;

    // ---- Pick targets based on play mode ----
    const targetTracks: Track[] = [];
    const seen = new Set<string>();

    const add = (t: Track | undefined) => {
      if (t && t.source !== "youtube" && !seen.has(t.id)) {
        seen.add(t.id);
        targetTracks.push(t);
      }
    };

    if (shuffle) {
      // Shuffle: prev-history (for ◀ button) + adjacent in feed (likely visible)
      if (playHistory.length > 0) {
        add(tracks[playHistory[playHistory.length - 1]]);
      }
      add(tracks[currentIndex + 1]);
      add(tracks[currentIndex - 1]);
      add(tracks[currentIndex + 2]);
      add(tracks[currentIndex - 2]);
    } else {
      // Sequential: next tracks (auto-advance order) + prev
      add(tracks[currentIndex + 1]);
      add(tracks[currentIndex + 2]);
      add(tracks[currentIndex + 3]);
      add(tracks[currentIndex - 1]);
    }

    const pool = preloadPoolRef.current;
    const targets = targetTracks.slice(0, pool.length);
    if (targets.length === 0) return;

    // ---- Resolve URLs & assign to pool elements ----
    let cancelled = false;

    targets.forEach(async (track, i) => {
      if (i >= pool.length || cancelled) return;
      const el = pool[i];

      // Skip if this slot is already buffering the same track
      if (el.getAttribute("data-track-id") === track.id) return;

      // Resolve the stream URL (cache → pending promise → fresh fetch)
      let url: string | null = null;
      const cached = streamCacheRef.current.get(track.id);

      if (typeof cached === "string") {
        url = cached;
      } else if (cached) {
        try {
          url = await cached;
        } catch {
          /* ignore */
        }
      } else {
        // Fire a fresh fetch and cache it
        try {
          const res = await fetch(
            `/api/stream?id=${encodeURIComponent(track.id)}`
          );
          if (res.ok) {
            const data = await res.json();
            if (data.url) {
              url = data.url as string;
              streamCacheRef.current.set(track.id, url as string);
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (!url || cancelled) return;

      // Assign to pool element — browser starts downloading audio data
      el.setAttribute("data-track-id", track.id);
      el.src = url;
      el.load();
    });

    return () => {
      cancelled = true;
    };
  }, [state.currentIndex]);

  /* ---------------------------------------------------------------- */
  /*  YouTube IFrame Player callbacks                                  */
  /*  These are called by the <YouTubePlayer /> component.            */
  /* ---------------------------------------------------------------- */

  const onYTReady = useCallback((player: YTPlayer) => {
    ytPlayerRef.current = player;
    player.setVolume(volumeRef.current);

    // If a load was queued before the player was ready, execute it now
    if (pendingYTLoadRef.current) {
      player.loadVideoById(pendingYTLoadRef.current);
      pendingYTLoadRef.current = null;
    }
  }, []);

  const onYTStateChange = useCallback((ytState: number) => {
    if (activeEngineRef.current !== "youtube") return;

    // YT.PlayerState: ENDED=0, PLAYING=1, PAUSED=2, BUFFERING=3, CUED=5
    if (ytState === 1) {
      // PLAYING
      isResolvingRef.current = false;
      consecutiveErrorsRef.current = 0;
      dispatch({ type: "SET_PLAYING", isPlaying: true });
    } else if (ytState === 2) {
      // PAUSED — only report if we're not in the middle of loading a new track
      if (!isResolvingRef.current) {
        dispatch({ type: "SET_PLAYING", isPlaying: false });
      }
    } else if (ytState === 0) {
      // ENDED — advance to next
      nextRef.current();
    }
  }, []);

  const onYTError = useCallback(() => {
    if (activeEngineRef.current !== "youtube") return;
    console.error("YouTube player error");
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
  }, []);

  const onYTProgress = useCallback(
    (currentTime: number, duration: number) => {
      if (activeEngineRef.current !== "youtube") return;
      if (duration > 0) {
        dispatch({
          type: "SET_PROGRESS",
          progress: currentTime / duration,
        });
        dispatch({
          type: "SET_DURATION",
          duration: duration * 1000, // seconds → ms
        });
      }
    },
    []
  );

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
        cacheStreamUrls,
        preloadStreams,
        onYTReady,
        onYTStateChange,
        onYTError,
        onYTProgress,
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
