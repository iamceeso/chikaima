import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ message: "Logout handled client-side by discarding tokens." });
}
