import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "@/core/auth/authService.js";
import { toUserResponse } from "@/core/auth/userResponses.js";

import { db, handleRoute, readJson, requireAdminUser } from "../_lib/http.js";

interface AdminCreateBody {
  email: string;
  full_name: string;
  password: string;
  is_superuser?: boolean;
  is_active?: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    await requireAdminUser(request, database);
    const users = new AuthService(database).users.listAll();
    return NextResponse.json(users.map(toUserResponse));
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const admin = await requireAdminUser(request, database);
    const body = await readJson<AdminCreateBody>(request);
    const user = new AuthService(database).createUser(admin, {
      email: body.email,
      fullName: body.full_name,
      password: body.password,
      isSuperuser: body.is_superuser ?? false,
      isActive: body.is_active ?? true,
    });
    return NextResponse.json(toUserResponse(user), { status: 201 });
  });
}
