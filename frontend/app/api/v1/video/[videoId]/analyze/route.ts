import { NextResponse } from "next/server";

type RouteContext = { params: Promise<{ videoId: string }> };

// Matches the Python original: this stub endpoint has no auth dependency.
export async function POST(_request: Request, context: RouteContext): Promise<NextResponse> {
  const { videoId } = await context.params;
  return NextResponse.json({ video_id: videoId, message: "Video analysis pipeline queued" });
}
