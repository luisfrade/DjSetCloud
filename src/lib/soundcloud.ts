import { Track } from "@/types";

let cachedClientId: string | null = null;

/**
 * In-memory cache for stream resolution data.
 * Stores { mediaUrl, trackAuth } keyed by SoundCloud numeric track ID.
 * Populated when tracks are fetched from the search API.
 */
const trackStreamCache = new Map<
  number,
  { mediaUrl: string; trackAuth: string }
>();

async function resolveClientId(): Promise<string> {
  if (process.env.SOUNDCLOUD_CLIENT_ID) {
    return process.env.SOUNDCLOUD_CLIENT_ID;
  }
  if (cachedClientId) {
    return cachedClientId;
  }

  const res = await fetch("https://soundcloud.com", {
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  const html = await res.text();
  const scriptUrls = [
    ...html.matchAll(
      /src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g
    ),
  ].map((m) => m[1]);

  for (const url of scriptUrls.slice(-5)) {
    try {
      const scriptRes = await fetch(url, { cache: "no-store" });
      const js = await scriptRes.text();
      const match = js.match(/client_id:"([a-zA-Z0-9]{32})"/);
      if (match) {
        cachedClientId = match[1];
        return cachedClientId;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Failed to resolve SoundCloud client_id");
}

export function clearClientIdCache() {
  cachedClientId = null;
}

interface SCApiTrack {
  id: number;
  title: string;
  permalink_url: string;
  artwork_url: string | null;
  duration: number;
  created_at: string;
  genre: string;
  user: {
    username: string;
    avatar_url: string;
  };
  media?: {
    transcodings?: Array<{
      url: string;
      preset: string;
      duration: number;
      snipped: boolean;
      format: {
        protocol: string;
        mime_type: string;
      };
      quality: string;
    }>;
  };
  track_authorization?: string;
}

interface SearchParams {
  query: string;
  genre: string;
  minDurationMs: number;
  limit: number;
  skipDateFilter?: boolean;
}

async function searchTracksForGenre(
  params: SearchParams,
  clientId: string
): Promise<Track[]> {
  const url = new URL("https://api-v2.soundcloud.com/search/tracks");
  url.searchParams.set("q", params.query);
  url.searchParams.set("filter.genre_or_tag", params.genre);
  url.searchParams.set("filter.duration", "epic");
  if (!params.skipDateFilter) {
    url.searchParams.set("filter.created_at", "last_month");
  }
  url.searchParams.set("limit", String(params.limit));
  url.searchParams.set("access", "playable");
  url.searchParams.set("linked_partitioning", "true");
  url.searchParams.set("client_id", clientId);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (res.status === 401 || res.status === 403) {
    clearClientIdCache();
    throw new Error(`SoundCloud API auth error: ${res.status}`);
  }

  if (!res.ok) {
    throw new Error(`SoundCloud API error: ${res.status}`);
  }

  const data = await res.json();
  const tracks: SCApiTrack[] = data.collection || [];

  return tracks
    .filter((t) => t.duration >= params.minDurationMs)
    .map((t) => {
      // Cache progressive (or HLS fallback) transcoding URL for stream resolution
      const progressive = t.media?.transcodings?.find(
        (tc) => tc.format.protocol === "progressive"
      );
      const hls = t.media?.transcodings?.find(
        (tc) => tc.format.protocol === "hls"
      );
      const mediaUrl = progressive?.url || hls?.url;
      if (mediaUrl && t.track_authorization) {
        trackStreamCache.set(t.id, {
          mediaUrl,
          trackAuth: t.track_authorization,
        });
      }

      return {
        id: `sc-${t.id}`,
        source: "soundcloud" as const,
        title: t.title,
        permalink_url: t.permalink_url,
        artwork_url: t.artwork_url,
        duration: t.duration,
        created_at: t.created_at,
        genre: t.genre,
        user: {
          username: t.user.username,
          avatar_url: t.user.avatar_url,
        },
      };
    });
}

const GENRES = ["afro house", "house", "techno", "tech house"];
const MIN_DURATION_MS = 40 * 60 * 1000; // 40 minutes

/**
 * Fetch tracks for a single genre with auth retry logic.
 */
async function fetchGenreWithRetry(
  params: SearchParams,
  clientId: string
): Promise<{ tracks: Track[]; clientId: string }> {
  try {
    const tracks = await searchTracksForGenre(params, clientId);
    return { tracks, clientId };
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("auth error") &&
      !process.env.SOUNDCLOUD_CLIENT_ID
    ) {
      clearClientIdCache();
      const newClientId = await resolveClientId();
      try {
        const tracks = await searchTracksForGenre(params, newClientId);
        return { tracks, clientId: newClientId };
      } catch {
        console.error(`Failed to fetch genre "${params.genre}" after retry`);
        return { tracks: [], clientId: newClientId };
      }
    }
    console.error(`Failed to fetch genre "${params.genre}":`, err);
    return { tracks: [], clientId };
  }
}

/**
 * Fetch all SoundCloud DJ-set tracks across genres.
 * First fetches recent tracks (last month), then backfills with older
 * content if needed to ensure the feed always has enough tracks.
 * Returns a de-duplicated, date-sorted array.
 */
export async function fetchSoundCloudTracks(): Promise<Track[]> {
  let clientId = await resolveClientId();
  const results: Track[] = [];
  const seenIds = new Set<string>();

  // 1. Fetch recent tracks (created in the last month) — prioritize fresh content
  for (const genre of GENRES) {
    const { tracks, clientId: updatedId } = await fetchGenreWithRetry(
      {
        query: genre + " dj set",
        genre,
        minDurationMs: MIN_DURATION_MS,
        limit: 50,
      },
      clientId
    );
    clientId = updatedId;
    for (const t of tracks) {
      if (!seenIds.has(t.id)) {
        seenIds.add(t.id);
        results.push(t);
      }
    }
  }

  // 2. If we got fewer than 20 recent tracks, backfill without date filter
  if (results.length < 20) {
    for (const genre of GENRES) {
      const { tracks, clientId: updatedId } = await fetchGenreWithRetry(
        {
          query: genre + " dj set",
          genre,
          minDurationMs: MIN_DURATION_MS,
          limit: 50,
          skipDateFilter: true,
        },
        clientId
      );
      clientId = updatedId;
      for (const t of tracks) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          results.push(t);
        }
      }
    }
  }

  // Sort by created_at descending (newest first)
  results.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return results;
}

/* ------------------------------------------------------------------ */
/*  SoundCloud Followings Feed                                         */
/* ------------------------------------------------------------------ */

const SC_PROFILE_URL = "https://soundcloud.com/luisfrade";

/**
 * Helper: does this SoundCloud track qualify as a DJ set in our genres?
 */
function isDjSet(t: SCApiTrack): boolean {
  if (t.duration < MIN_DURATION_MS) return false;
  const haystack = `${(t.genre || "").toLowerCase()} ${(t.title || "").toLowerCase()}`;
  return GENRES.some((g) => haystack.includes(g));
}

/**
 * Convert a raw SC API track into our Track model (sc-following source).
 * Also populates the stream cache.
 */
function toFollowingTrack(t: SCApiTrack): Track {
  const progressive = t.media?.transcodings?.find(
    (tc) => tc.format.protocol === "progressive"
  );
  const hls = t.media?.transcodings?.find(
    (tc) => tc.format.protocol === "hls"
  );
  const mediaUrl = progressive?.url || hls?.url;
  if (mediaUrl && t.track_authorization) {
    trackStreamCache.set(t.id, { mediaUrl, trackAuth: t.track_authorization });
  }

  return {
    id: `sc-${t.id}`,
    source: "sc-following" as const,
    title: t.title,
    permalink_url: t.permalink_url,
    artwork_url: t.artwork_url,
    duration: t.duration,
    created_at: t.created_at,
    genre: t.genre,
    user: {
      username: t.user.username,
      avatar_url: t.user.avatar_url,
    },
  };
}

/**
 * Fetch DJ-set tracks from artists the user follows on SoundCloud.
 * Resolves the user profile, fetches the followings list, then
 * retrieves recent tracks for each followed artist and filters
 * by the same duration / genre rules used elsewhere.
 */
export async function fetchSoundCloudFollowingsTracks(): Promise<Track[]> {
  const clientId = await resolveClientId();

  // 1. Resolve user ID from profile URL
  const resolveRes = await fetch(
    `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(SC_PROFILE_URL)}&client_id=${clientId}`,
    { cache: "no-store", signal: AbortSignal.timeout(10000) }
  );
  if (!resolveRes.ok) {
    console.error("Failed to resolve SC user profile:", resolveRes.status);
    return [];
  }
  const userData = await resolveRes.json();
  const userId: number = userData.id;

  // 2. Fetch followings (up to 200 artists)
  interface SCFollowing { id: number; username: string }
  const followings: SCFollowing[] = [];
  let nextHref: string | null =
    `https://api-v2.soundcloud.com/users/${userId}/followings?client_id=${clientId}&limit=200`;

  while (nextHref && followings.length < 200) {
    try {
      const url: string = nextHref;
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) break;
      const data = await res.json();
      followings.push(...(data.collection || []));
      nextHref = data.next_href
        ? `${data.next_href}&client_id=${clientId}`
        : null;
    } catch {
      break;
    }
  }

  console.log(`SC followings: ${followings.length} artists found`);

  // 3. Fetch recent tracks from each followed artist (batches of 15)
  const BATCH_SIZE = 15;
  const results: Track[] = [];
  const seenIds = new Set<string>();

  for (let i = 0; i < followings.length; i += BATCH_SIZE) {
    const batch = followings.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(async (user) => {
        const res = await fetch(
          `https://api-v2.soundcloud.com/users/${user.id}/tracks?client_id=${clientId}&limit=20&linked_partitioning=true`,
          { cache: "no-store", signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data.collection || []) as SCApiTrack[];
      })
    );

    for (const result of batchResults) {
      if (result.status !== "fulfilled") continue;
      for (const t of result.value) {
        if (!isDjSet(t)) continue;
        const id = `sc-${t.id}`;
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        results.push(toFollowingTrack(t));
      }
    }
  }

  console.log(`SC followings: ${results.length} qualifying DJ sets`);

  results.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return results;
}

/**
 * Resolve a direct streaming URL for a SoundCloud track by its numeric ID.
 * First checks the in-memory cache (populated during search), then falls back
 * to fetching the track by ID from the SoundCloud API.
 */
export async function resolveSoundCloudStreamUrl(
  numericId: number
): Promise<string> {
  const clientId = await resolveClientId();

  let streamData = trackStreamCache.get(numericId);

  if (!streamData) {
    // Cache miss — fetch the track by ID to get transcodings
    const res = await fetch(
      `https://api-v2.soundcloud.com/tracks/${numericId}?client_id=${clientId}`,
      { cache: "no-store", signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) throw new Error(`Failed to fetch track ${numericId}`);
    const track: SCApiTrack = await res.json();

    const progressive = track.media?.transcodings?.find(
      (tc) => tc.format.protocol === "progressive"
    );
    const hls = track.media?.transcodings?.find(
      (tc) => tc.format.protocol === "hls"
    );
    const mediaUrl = progressive?.url || hls?.url;

    if (!mediaUrl || !track.track_authorization) {
      throw new Error("No streaming data available for this track");
    }

    streamData = { mediaUrl, trackAuth: track.track_authorization };
    trackStreamCache.set(numericId, streamData);
  }

  // Resolve the actual stream URL from the transcoding endpoint
  const resolveUrl = `${streamData.mediaUrl}?client_id=${clientId}&track_authorization=${streamData.trackAuth}`;
  const res = await fetch(resolveUrl, { cache: "no-store", signal: AbortSignal.timeout(10000) });

  if (!res.ok) {
    // Cache might be stale — clear and throw so caller can retry
    trackStreamCache.delete(numericId);
    throw new Error("Failed to resolve SoundCloud stream URL");
  }

  const data = await res.json();
  if (!data.url) {
    throw new Error("No stream URL in SoundCloud response");
  }

  return data.url;
}
