import { Track } from "@/types";

const PIPED_INSTANCES = [
  "https://pipedapi.wireway.ch",
  "https://pipedapi.osphost.fi",
  "https://pipedapi.ngn.tf",
];

interface PipedSearchItem {
  url: string; // "/watch?v=abc123"
  title: string;
  thumbnail: string;
  uploaderName: string;
  uploaderUrl: string;
  uploaderAvatar: string;
  uploadedDate: string; // relative like "2 months ago"
  uploaded: number; // timestamp ms (-1 if unknown)
  duration: number; // seconds
  views: number;
  type: string; // "stream" for videos
}

interface PipedSearchResponse {
  items: PipedSearchItem[];
  nextpage: string;
  corrected: boolean;
}

/**
 * Try to fetch from multiple Piped instances with fallback.
 */
async function pipedFetch<T>(path: string): Promise<T> {
  let lastError: Error | null = null;

  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}${path}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        return (await res.json()) as T;
      }
      lastError = new Error(`Piped ${instance} returned ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  throw lastError ?? new Error("All Piped instances failed");
}

const BASE_QUERIES = [
  "afro house dj set",
  "house music dj set",
  "techno dj set",
  "tech house dj set",
  "lofi dj set",
  "lo-fi house dj set",
];

const MIN_DURATION_SEC = 40 * 60; // 40 minutes

/**
 * Build search queries that bias towards recent content.
 * Uses the current year and "new"/"latest" keywords.
 */
function buildQueries(): string[] {
  const year = new Date().getFullYear();
  const queries: string[] = [];

  // Add year-tagged queries for recency
  for (const q of BASE_QUERIES) {
    queries.push(`${q} ${year}`);
  }

  // Add base queries as fallback (broader results)
  for (const q of BASE_QUERIES) {
    queries.push(q);
  }

  return queries;
}

/**
 * Genre keywords to detect in track titles and enrich the genre tag.
 * Each entry has a canonical tag and title patterns (lowercase) to match.
 * Plain "house" is excluded — too generic ("warehouse", "in the house")
 * and all house sub-genres already contain "house" for substring matching.
 */
const TITLE_GENRE_HINTS = [
  { tag: "afro house", patterns: ["afro house", "afrohouse", "afro-house"] },
  { tag: "tech house", patterns: ["tech house", "techhouse", "tech-house"] },
  { tag: "techno", patterns: ["techno"] },
  { tag: "lofi", patterns: ["lofi", "lo-fi", "lo fi"] },
];

/**
 * Derive genre from the search query and enrich with keywords found
 * in the video title (e.g. a track found via "house music dj set"
 * whose title mentions "techno" also gets tagged as techno).
 */
function deriveGenre(query: string, title: string): string {
  let genre = query.replace(" dj set", "").replace(" music", "");
  const titleLower = title.toLowerCase();
  const genreNorm = genre.toLowerCase().replace(/[-\s]/g, "");

  for (const { tag, patterns } of TITLE_GENRE_HINTS) {
    const tagNorm = tag.replace(/[-\s]/g, "");
    if (genreNorm.includes(tagNorm)) continue; // already tagged
    if (patterns.some((p) => titleLower.includes(p))) {
      genre = tag + ", " + genre;
    }
  }

  return genre;
}

/**
 * Fetch DJ sets from YouTube via Piped API (search only).
 * Playback uses the YouTube IFrame Player API (client-side).
 */
export async function fetchYouTubeTracks(): Promise<Track[]> {
  const results: Track[] = [];
  const seenIds = new Set<string>();
  const queries = buildQueries();

  for (const query of queries) {
    try {
      const data = await pipedFetch<PipedSearchResponse>(
        `/search?q=${encodeURIComponent(query)}&filter=videos`
      );

      const items = (data.items || []).filter(
        (item) =>
          item.type === "stream" &&
          item.duration >= MIN_DURATION_SEC &&
          item.url?.startsWith("/watch?v=")
      );

      for (const item of items) {
        const videoId = item.url.replace("/watch?v=", "");
        if (seenIds.has(videoId)) continue;
        seenIds.add(videoId);

        // Derive a reasonable created_at from the uploaded timestamp
        let createdAt: string;
        if (item.uploaded && item.uploaded > 0) {
          createdAt = new Date(item.uploaded).toISOString();
        } else {
          // Parse relative date as fallback (rough estimate)
          createdAt = parseRelativeDate(item.uploadedDate);
        }

        results.push({
          id: `yt-${videoId}`,
          source: "youtube",
          title: item.title,
          permalink_url: `https://www.youtube.com/watch?v=${videoId}`,
          artwork_url: item.thumbnail || null,
          duration: item.duration * 1000, // convert seconds → ms
          created_at: createdAt,
          genre: deriveGenre(query, item.title),
          user: {
            username: item.uploaderName || "Unknown",
            avatar_url: item.uploaderAvatar || "",
          },
        });
      }
    } catch (err) {
      console.error(`Failed to fetch YouTube tracks for "${query}":`, err);
    }
  }

  return results;
}

/**
 * Parse a Piped-style relative date string (e.g. "2 months ago")
 * into an ISO date string. This is a rough estimate.
 */
function parseRelativeDate(relative: string): string {
  if (!relative) return new Date().toISOString();

  const now = Date.now();
  const lower = relative.toLowerCase();

  const match = lower.match(/(\d+)\s*(second|minute|hour|day|week|month|year)/);
  if (!match) return new Date().toISOString();

  const amount = parseInt(match[1], 10);
  const unit = match[2];

  const msPerUnit: Record<string, number> = {
    second: 1000,
    minute: 60 * 1000,
    hour: 3600 * 1000,
    day: 86400 * 1000,
    week: 7 * 86400 * 1000,
    month: 30 * 86400 * 1000,
    year: 365 * 86400 * 1000,
  };

  const ms = msPerUnit[unit] || 86400 * 1000;
  return new Date(now - amount * ms).toISOString();
}
