import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "@/core/auth/authService.js";

import { db, handleRoute, readJson } from "../../_lib/http.js";

interface LoginBody {
  email: string;
  password: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const body = await readJson<LoginBody>(request);
    const { accessToken, refreshToken } = await new AuthService(db()).login({ email: body.email, password: body.password });
    return NextResponse.json({ access_token: accessToken, refresh_token: refreshToken, token_type: "bearer" });
  });
}
