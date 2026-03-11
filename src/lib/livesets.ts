import { Track } from "@/types";

const BASE = "https://livesets.com";

const TARGET_GENRES = [
  "house",
  "tech house",
  "techno",
  "deep house",
  "progressive house",
  "afro house",
  "electro house",
  "minimal",
  "electronica",
  "indie dance",
];

const MIN_DURATION_SEC = 40 * 60; // 40 minutes

/**
 * Fetch DJ sessions from livesets.com by scraping the session listing page,
 * then filtering by genre and duration.
 */
export async function fetchLivesetsTracks(): Promise<Track[]> {
  const results: Track[] = [];
  const seenIds = new Set<string>();

  // Fetch the first 4 pages of newest sessions for more content
  for (const page of [1, 2, 3, 4]) {
    try {
      const url =
        page === 1
          ? `${BASE}/session/all/new`
          : `${BASE}/session/all/new?ms=${page}`;

      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: "text/html",
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (!res.ok) {
        console.error(`Livesets page ${page} returned ${res.status}`);
        continue;
      }

      const html = await res.text();
      const sessions = parseSessionsFromHTML(html);

      for (const session of sessions) {
        if (seenIds.has(session.sessionId)) continue;
        seenIds.add(session.sessionId);

        // Filter by genre
        const matchesGenre = session.genres.some((g) =>
          TARGET_GENRES.some(
            (target) =>
              g.toLowerCase().includes(target) ||
              target.includes(g.toLowerCase())
          )
        );
        if (!matchesGenre) continue;

        // Filter by duration (>= 40 min)
        if (session.durationSec < MIN_DURATION_SEC) continue;

        results.push({
          id: `ls-${session.sessionId}`,
          source: "livesets",
          title: session.title,
          permalink_url: `${BASE}/${session.username}/session/${session.sessionId}`,
          artwork_url: session.thumbnailUrl || null,
          duration: session.durationSec * 1000, // seconds → ms
          created_at: parseRelativeDate(session.timeAgo),
          genre: session.genres.join(", "),
          user: {
            username: session.artist || session.username,
            avatar_url: session.thumbnailUrl || "",
          },
        });
      }
    } catch (err) {
      console.error(`Failed to fetch livesets page ${page}:`, err);
    }
  }

  return results;
}

interface ParsedSession {
  sessionId: string;
  username: string;
  title: string;
  artist: string;
  genres: string[];
  durationSec: number;
  timeAgo: string;
  thumbnailUrl: string | null;
}

/**
 * Parse session entries from the livesets.com HTML listing page.
 */
function parseSessionsFromHTML(html: string): ParsedSession[] {
  const sessions: ParsedSession[] = [];

  // Find all session links: href="/username/session/12345"
  const linkRegex = /href="\/([\w.-]+)\/session\/(\d+)"/g;
  let match: RegExpExecArray | null;
  const sessionPositions: Array<{
    username: string;
    sessionId: string;
    pos: number;
  }> = [];

  while ((match = linkRegex.exec(html)) !== null) {
    sessionPositions.push({
      username: match[1],
      sessionId: match[2],
      pos: match.index,
    });
  }

  for (let i = 0; i < sessionPositions.length; i++) {
    const { username, sessionId, pos } = sessionPositions[i];

    // Extract the HTML block around this session entry
    // (from this link to the next link, or 2000 chars max)
    const endPos = sessionPositions[i + 1]?.pos ?? pos + 2000;
    const block = html.substring(Math.max(0, pos - 500), endPos);

    // Extract session title from the link text
    const titleMatch = block.match(
      new RegExp(
        `/${username}/session/${sessionId}"[^>]*>([^<]+)</a>`
      )
    );
    const title = titleMatch
      ? titleMatch[1].trim()
      : `Session ${sessionId}`;

    // Extract artist name (text like "ArtistName | X ago")
    const artistMatch = block.match(
      /(?:Session\s+#\d+|<\/a>)\s*(?:<[^>]*>)*\s*([\w\s.&'()]+?)\s*\|\s*(\d+\s+\w+\s+ago)/
    );
    const artist = artistMatch ? artistMatch[1].trim() : username;
    const timeAgo = artistMatch
      ? artistMatch[2].trim()
      : extractTimeAgo(block);

    // Extract duration (H:MM:SS or MM:SS pattern)
    const durMatch = block.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    let durationSec = 0;
    if (durMatch) {
      durationSec =
        parseInt(durMatch[1], 10) * 3600 +
        parseInt(durMatch[2], 10) * 60 +
        parseInt(durMatch[3], 10);
    }

    // Extract genres (known genre names in the text)
    const genres = extractGenres(block);

    // Extract thumbnail URL
    const imgMatch = block.match(
      /src="((?:https?:)?\/\/[^"]*(?:\.jpg|\.png|\.jpeg|\.gif|\.webp)[^"]*)"/i
    );
    let thumbnailUrl: string | null = null;
    if (imgMatch) {
      thumbnailUrl = imgMatch[1].startsWith("//")
        ? `https:${imgMatch[1]}`
        : imgMatch[1];
    } else {
      // Try relative URL thumbnails
      const relImgMatch = block.match(
        /src="(\/cache\/images\/[^"]+)"/i
      );
      if (relImgMatch) {
        thumbnailUrl = `${BASE}${relImgMatch[1]}`;
      }
    }

    sessions.push({
      sessionId,
      username,
      title,
      artist,
      genres,
      durationSec,
      timeAgo,
      thumbnailUrl,
    });
  }

  return sessions;
}

const KNOWN_GENRES = [
  "Afro House",
  "Ambient",
  "Breakbeat",
  "Deep House",
  "Drum & Bass",
  "Dubstep",
  "Electro House",
  "Electronica",
  "Funk",
  "Hard Techno",
  "Hip-Hop",
  "House",
  "Indie Dance",
  "Indie Dance / Nu Disco",
  "Jazz",
  "Minimal",
  "Minimal / Deep Tech",
  "Nu Disco",
  "Pop",
  "Progressive House",
  "R&B",
  "Reggae",
  "Rock",
  "Soul",
  "Tech House",
  "Techno",
  "Trance",
  "UK Garage",
  "Uplifting Trance",
];

function extractGenres(text: string): string[] {
  const found: string[] = [];
  for (const genre of KNOWN_GENRES) {
    if (text.includes(genre)) {
      // Avoid false positives: "Tech House" also matches "House"
      // Only add the longer match if both match
      const hasLongerMatch = found.some(
        (g) => g.includes(genre) || genre.includes(g)
      );
      if (!hasLongerMatch) {
        found.push(genre);
      }
    }
  }
  return found.length > 0 ? found : ["Unknown"];
}

function extractTimeAgo(text: string): string {
  const match = text.match(/(\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)/i);
  return match ? match[1] : "recently";
}

/**
 * Parse a relative date string (e.g. "2 days ago") into ISO date.
 */
function parseRelativeDate(relative: string): string {
  if (!relative || relative === "recently") return new Date().toISOString();

  const now = Date.now();
  const lower = relative.toLowerCase();
  const match = lower.match(
    /(\d+)\s*(second|minute|hour|day|week|month|year)/
  );
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

/**
 * Resolve a direct MP3 stream URL for a livesets.com session
 * by calling their JSON metadata API.
 */
export async function resolveLivesetsStreamUrl(
  sessionId: string
): Promise<string> {
  const res = await fetch(`${BASE}/json/session/meta/${sessionId}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(`Livesets meta API returned ${res.status}`);
  }

  const data = await res.json();

  // Prefer MP3
  if (data.urlSound) {
    return `${BASE}${data.urlSound}`;
  }

  // Fallback: check urlAudio array
  if (data.urlAudio && Array.isArray(data.urlAudio)) {
    const mp3 = data.urlAudio.find(
      (a: { type: string; url: string }) => a.type === "audio/mpeg"
    );
    if (mp3?.url) return `${BASE}${mp3.url}`;

    const ogg = data.urlAudio.find(
      (a: { type: string; url: string }) => a.type === "audio/ogg"
    );
    if (ogg?.url) return `${BASE}${ogg.url}`;
  }

  throw new Error(`No audio URL found for livesets session ${sessionId}`);
}
