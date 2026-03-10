import { Track } from "@/types";

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://pipedapi.in.projectsegfau.lt",
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

interface PipedStreamResponse {
  audioStreams: Array<{
    url: string;
    mimeType: string;
    quality: string;
    bitrate: number;
    contentLength: number;
    codec: string;
  }>;
  title: string;
  description: string;
  uploadDate: string; // ISO-ish "YYYY-MM-DD"
  uploader: string;
  uploaderUrl: string;
  uploaderAvatar: string;
  thumbnailUrl: string;
  duration: number; // seconds
}

/**
 * Try to fetch from multiple Piped instances with fallback.
 */
async function pipedFetch<T>(path: string): Promise<T> {
  let lastError: Error | null = null;

  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${instance}${path}`, {
        signal: AbortSignal.timeout(12000),
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

const QUERIES = [
  "afro house dj set",
  "house music dj set",
  "techno dj set",
  "tech house dj set",
];

const MIN_DURATION_SEC = 40 * 60; // 40 minutes

/**
 * Fetch DJ sets from YouTube via Piped API.
 */
export async function fetchYouTubeTracks(): Promise<Track[]> {
  const results: Track[] = [];
  const seenIds = new Set<string>();

  for (const query of QUERIES) {
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
          genre: query.replace(" dj set", "").replace(" music", ""),
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
 * Resolve a direct audio stream URL for a YouTube video via Piped.
 */
export async function resolveYouTubeStreamUrl(
  videoId: string
): Promise<string> {
  const data = await pipedFetch<PipedStreamResponse>(`/streams/${videoId}`);

  const audioStreams = data.audioStreams || [];

  if (audioStreams.length === 0) {
    throw new Error(`No audio streams found for video ${videoId}`);
  }

  // Sort by bitrate descending (best quality first)
  const sorted = [...audioStreams].sort(
    (a, b) => (b.bitrate || 0) - (a.bitrate || 0)
  );

  // Prefer MP4/M4A audio for iOS Safari compatibility
  const mp4Audio = sorted.find(
    (s) =>
      s.mimeType?.includes("audio/mp4") || s.mimeType?.includes("audio/m4a")
  );
  if (mp4Audio?.url) return mp4Audio.url;

  // Fallback: any audio stream with a URL
  const fallback = sorted.find((s) => !!s.url);
  if (fallback?.url) return fallback.url;

  throw new Error(`No usable audio stream for video ${videoId}`);
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
