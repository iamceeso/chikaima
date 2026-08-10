import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "@/core/auth/authService.js";

import { db, handleRoute, readJson } from "../../../_lib/http.js";

interface PasswordResetRequestBody {
  email: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const body = await readJson<PasswordResetRequestBody>(request);
    const result = await new AuthService(db()).requestPasswordReset(body.email);
    return NextResponse.json(result);
  });
}
