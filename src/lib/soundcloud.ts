import { Track } from "@/types";

let cachedClientId: string | null = null;

async function resolveClientId(): Promise<string> {
  // Check env var first
  if (process.env.SOUNDCLOUD_CLIENT_ID) {
    return process.env.SOUNDCLOUD_CLIENT_ID;
  }

  // Return cached if available
  if (cachedClientId) {
    return cachedClientId;
  }

  // Scrape client_id from SoundCloud's JS bundles
  const res = await fetch("https://soundcloud.com", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  });
  const html = await res.text();

  // Find cross-origin script URLs
  const scriptUrls = [
    ...html.matchAll(/src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"]+\.js)"/g),
  ].map((m) => m[1]);

  for (const url of scriptUrls.slice(-5)) {
    try {
      const scriptRes = await fetch(url);
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

interface SearchParams {
  query: string;
  genre: string;
  minDurationMs: number;
  limit: number;
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
}

async function searchTracksForGenre(
  params: SearchParams,
  clientId: string
): Promise<Track[]> {
  const url = new URL("https://api-v2.soundcloud.com/search/tracks");
  url.searchParams.set("q", params.query);
  url.searchParams.set("filter.genre_or_tag", params.genre);
  url.searchParams.set("filter.duration", "epic"); // epic = 10+ min on SC
  url.searchParams.set("limit", String(params.limit));
  url.searchParams.set("access", "playable");
  url.searchParams.set("linked_partitioning", "true");
  url.searchParams.set("client_id", clientId);

  const res = await fetch(url.toString(), {
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

  // Filter by minimum duration (40 min = 2,400,000 ms)
  return tracks
    .filter((t) => t.duration >= params.minDurationMs)
    .map((t) => ({
      id: t.id,
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
    }));
}

const GENRES = ["afro house", "house", "techno", "tech house"];
const MIN_DURATION_MS = 40 * 60 * 1000; // 40 minutes

export async function fetchAllTracks(
  offset: number = 0,
  limit: number = 50
): Promise<{ tracks: Track[]; nextOffset: number | null }> {
  let clientId = await resolveClientId();

  const results: Track[] = [];

  for (const genre of GENRES) {
    try {
      const tracks = await searchTracksForGenre(
        {
          query: genre + " dj set",
          genre,
          minDurationMs: MIN_DURATION_MS,
          limit: 50,
        },
        clientId
      );
      results.push(...tracks);
    } catch (err) {
      // If auth error, try re-resolving client_id once
      if (
        err instanceof Error &&
        err.message.includes("auth error") &&
        !process.env.SOUNDCLOUD_CLIENT_ID
      ) {
        clearClientIdCache();
        clientId = await resolveClientId();
        try {
          const tracks = await searchTracksForGenre(
            {
              query: genre + " dj set",
              genre,
              minDurationMs: MIN_DURATION_MS,
              limit: 50,
            },
            clientId
          );
          results.push(...tracks);
        } catch {
          console.error(`Failed to fetch genre "${genre}" after retry`);
        }
      } else {
        console.error(`Failed to fetch genre "${genre}":`, err);
      }
    }
  }

  if (results.length === 0) {
    throw new Error("No tracks found from any genre search");
  }

  // Deduplicate by track ID
  const seen = new Set<number>();
  const unique = results.filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  // Sort by created_at descending (newest first)
  unique.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Apply pagination
  const paginated = unique.slice(offset, offset + limit);
  const nextOffset =
    offset + limit < unique.length ? offset + limit : null;

  return { tracks: paginated, nextOffset };
}
