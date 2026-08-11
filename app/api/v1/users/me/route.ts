import { NextResponse, type NextRequest } from "next/server";

import { UserRepository } from "@/core/auth/repository.js";
import { toUserResponse } from "@/core/auth/userResponses.js";

import { db, handleRoute, readJson, requireUser } from "../../_lib/http.js";

interface ProfileUpdateBody {
  full_name: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const user = await requireUser(request, db());
    return NextResponse.json(toUserResponse(user));
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    const body = await readJson<ProfileUpdateBody>(request);
    const updated = new UserRepository(database).update(user.id, { fullName: body.full_name });
    return NextResponse.json(toUserResponse(updated));
  });
}
