import { NextResponse, type NextRequest } from "next/server";

import { AuthService } from "@/core/auth/authService.js";
import { toUserResponse } from "@/core/auth/userResponses.js";
import { badRequest, notFound } from "@/core/errors.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../_lib/http.js";

interface AdminUpdateBody {
  email?: string;
  full_name?: string;
  password?: string;
  is_superuser?: boolean;
  is_active?: boolean;
}

type RouteContext = { params: Promise<{ userId: string }> };

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { userId } = await context.params;
    const database = db();
    const admin = await requireAdminUser(request, database);
    const auth = new AuthService(database);

    const target = auth.users.get(userId);
    if (!target) throw notFound("User not found");
    if (target.id === admin.id) throw badRequest("You cannot delete your own account");
    if (target.isSuperuser && auth.users.countSuperusers() <= 1) {
      throw badRequest("At least one admin account is required");
    }

    auth.users.delete(target.id);
    return new NextResponse(null, { status: 204 });
  });
}

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { userId } = await context.params;
    const database = db();
    const admin = await requireAdminUser(request, database);
    const body = await readJson<AdminUpdateBody>(request);
    const updated = new AuthService(database).updateUser(admin, userId, {
      email: body.email,
      fullName: body.full_name,
      password: body.password,
      isSuperuser: body.is_superuser,
      isActive: body.is_active,
    });
    return NextResponse.json(toUserResponse(updated));
  });
}
