import { NextRequest, NextResponse } from "next/server";
import { resolveSoundCloudStreamUrl } from "@/lib/soundcloud";
import { resolveLivesetsStreamUrl } from "@/lib/livesets";

/**
 * Resolve a direct stream URL for a SoundCloud or Livesets track.
 * YouTube tracks use the IFrame Player API (client-side) and don't need this endpoint.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Missing id parameter" },
      { status: 400 }
    );
  }

  try {
    let url: string;

    if (id.startsWith("sc-")) {
      const numericId = parseInt(id.slice(3), 10);
      if (isNaN(numericId)) {
        return NextResponse.json(
          { error: "Invalid SoundCloud track ID" },
          { status: 400 }
        );
      }
      url = await resolveSoundCloudStreamUrl(numericId);
    } else if (id.startsWith("ls-")) {
      const sessionId = id.slice(3);
      if (!sessionId) {
        return NextResponse.json(
          { error: "Invalid Livesets session ID" },
          { status: 400 }
        );
      }
      url = await resolveLivesetsStreamUrl(sessionId);
    } else {
      return NextResponse.json(
        { error: "Invalid track ID format — expected sc-* or ls-*" },
        { status: 400 }
      );
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error("Stream resolution failed for", id, ":", err);
    const message =
      err instanceof Error ? err.message : "Failed to resolve stream URL";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
