import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "@/core/auth/authService.js";

import { db, handleRoute, readJson } from "../../_lib/http.js";

interface RefreshBody {
  refresh_token: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const body = await readJson<RefreshBody>(request);
    const accessToken = await new AuthService(db()).refresh(body.refresh_token);
    return NextResponse.json({ access_token: accessToken, token_type: "bearer" });
  });
}
