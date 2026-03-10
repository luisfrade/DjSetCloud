import { NextRequest, NextResponse } from "next/server";
import { resolveSoundCloudStreamUrl } from "@/lib/soundcloud";
import { resolveYouTubeStreamUrl } from "@/lib/youtube";

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
    } else if (id.startsWith("yt-")) {
      const videoId = id.slice(3);
      if (!videoId) {
        return NextResponse.json(
          { error: "Invalid YouTube video ID" },
          { status: 400 }
        );
      }
      url = await resolveYouTubeStreamUrl(videoId);
    } else {
      return NextResponse.json(
        { error: "Invalid track ID format — expected sc-* or yt-*" },
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
