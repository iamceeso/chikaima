import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "@/core/auth/authService.js";

import { db, handleRoute, readJson } from "../../../_lib/http.js";

interface PasswordResetConfirmBody {
  token: string;
  new_password: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const body = await readJson<PasswordResetConfirmBody>(request);
    const result = await new AuthService(db()).confirmPasswordReset({ token: body.token, newPassword: body.new_password });
    return NextResponse.json(result);
  });
}
