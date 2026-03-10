import { NextRequest, NextResponse } from "next/server";
import { fetchSoundCloudTracks } from "@/lib/soundcloud";
import { fetchYouTubeTracks } from "@/lib/youtube";
import { Track } from "@/types";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const limit = Math.min(
    parseInt(searchParams.get("limit") || "50", 10),
    200
  );

  try {
    // Fetch from both sources in parallel
    const [scResult, ytResult] = await Promise.allSettled([
      fetchSoundCloudTracks(),
      fetchYouTubeTracks(),
    ]);

    const allTracks: Track[] = [];

    if (scResult.status === "fulfilled") {
      allTracks.push(...scResult.value);
    } else {
      console.error("SoundCloud fetch failed:", scResult.reason);
    }

    if (ytResult.status === "fulfilled") {
      allTracks.push(...ytResult.value);
    } else {
      console.error("YouTube fetch failed:", ytResult.reason);
    }

    if (allTracks.length === 0) {
      return NextResponse.json(
        { error: "No tracks found from any source. Please try again later." },
        { status: 503 }
      );
    }

    // Deduplicate by ID (across sources there shouldn't be dupes, but safety)
    const seen = new Set<string>();
    const unique = allTracks.filter((t) => {
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

    return NextResponse.json({ tracks: paginated, nextOffset });
  } catch (err) {
    console.error("Failed to fetch tracks:", err);
    const message =
      err instanceof Error ? err.message : "Failed to fetch tracks";

    if (message.includes("auth error")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }

    return NextResponse.json(
      { error: "Unable to load tracks. Please try again later." },
      { status: 503 }
    );
  }
}
