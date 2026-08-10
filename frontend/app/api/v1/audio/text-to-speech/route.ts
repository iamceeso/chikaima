import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ detail: "Text-to-speech API is not implemented in this release." }, { status: 501 });
}
