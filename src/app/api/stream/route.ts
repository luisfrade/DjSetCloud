import { NextRequest, NextResponse } from "next/server";
import { resolveSoundCloudStreamUrl } from "@/lib/soundcloud";

/**
 * Resolve a direct stream URL for a SoundCloud track.
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

  if (!id.startsWith("sc-")) {
    return NextResponse.json(
      { error: "Only SoundCloud stream resolution is supported" },
      { status: 400 }
    );
  }

  try {
    const numericId = parseInt(id.slice(3), 10);
    if (isNaN(numericId)) {
      return NextResponse.json(
        { error: "Invalid SoundCloud track ID" },
        { status: 400 }
      );
    }

    const url = await resolveSoundCloudStreamUrl(numericId);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Stream resolution failed for", id, ":", err);
    const message =
      err instanceof Error ? err.message : "Failed to resolve stream URL";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
