import { NextResponse, type NextRequest } from "next/server";

import { getSettingsOwnerUser } from "@/core/auth/deps.js";
import { ProviderService, toProviderResponse } from "@/core/providers/providerService.js";

import { db, handleRoute, requireAdminUser } from "../../../_lib/http.js";

type RouteContext = { params: Promise<{ providerId: string }> };

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { providerId } = await context.params;
    const database = db();
    const admin = await requireAdminUser(request, database);
    const owner = getSettingsOwnerUser(database, admin);
    const provider = await new ProviderService(database).resyncModels(owner.id, providerId);
    return NextResponse.json(toProviderResponse(provider));
  });
}
