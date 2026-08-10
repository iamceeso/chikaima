import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "@/core/auth/authService.js";
import { toUserResponse } from "@/core/auth/userResponses.js";

import { db, handleRoute, readJson } from "../../_lib/http.js";

interface RegisterBody {
  email: string;
  full_name: string;
  password: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const body = await readJson<RegisterBody>(request);
    const user = new AuthService(db()).register({ email: body.email, fullName: body.full_name, password: body.password });
    return NextResponse.json(toUserResponse(user));
  });
}
