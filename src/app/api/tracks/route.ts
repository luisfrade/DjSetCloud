import { NextRequest, NextResponse } from "next/server";
import { fetchAllTracks } from "@/lib/soundcloud";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const offset = parseInt(searchParams.get("offset") || "0", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  try {
    const result = await fetchAllTracks(offset, limit);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to fetch tracks:", err);

    const message =
      err instanceof Error ? err.message : "Failed to fetch tracks";

    if (message.includes("auth error")) {
      return NextResponse.json({ error: message }, { status: 503 });
    }

    return NextResponse.json(
      { error: "Unable to connect to SoundCloud. Please try again later." },
      { status: 503 }
    );
  }
}
