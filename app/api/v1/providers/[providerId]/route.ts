import { NextResponse, type NextRequest } from "next/server";

import { getSettingsOwnerUser } from "@/core/auth/deps.js";
import { ProviderService, toProviderResponse } from "@/core/providers/providerService.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../_lib/http.js";

interface ProviderUpdateBody {
  name?: string | null;
  base_url?: string | null;
  is_enabled?: boolean | null;
  api_key?: string | null;
  config?: Record<string, unknown> | null;
}

type RouteContext = { params: Promise<{ providerId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { providerId } = await context.params;
    const database = db();
    const admin = await requireAdminUser(request, database);
    const owner = getSettingsOwnerUser(database, admin);
    const body = await readJson<ProviderUpdateBody>(request);
    const provider = await new ProviderService(database).update(owner.id, providerId, {
      name: body.name,
      baseUrl: body.base_url,
      isEnabled: body.is_enabled,
      apiKey: body.api_key,
      config: body.config,
    });
    return NextResponse.json(toProviderResponse(provider));
  });
}

export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return handleRoute(async () => {
    const { providerId } = await context.params;
    const database = db();
    const admin = await requireAdminUser(request, database);
    const owner = getSettingsOwnerUser(database, admin);
    new ProviderService(database).delete(owner.id, providerId);
    return new NextResponse(null, { status: 204 });
  });
}
