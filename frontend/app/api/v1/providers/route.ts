import { NextResponse, type NextRequest } from "next/server";

import { getSettingsOwnerUser } from "@/core/auth/deps.js";
import { ProviderService, toProviderResponse, type ProviderType } from "@/core/providers/providerService.js";

import { db, handleRoute, readJson, requireAdminUser } from "../_lib/http.js";

interface ProviderCreateBody {
  name: string;
  provider_type: ProviderType;
  base_url?: string | null;
  api_key?: string | null;
  config?: Record<string, unknown>;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const admin = await requireAdminUser(request, database);
    const owner = getSettingsOwnerUser(database, admin);
    const providers = new ProviderService(database).listForUser(owner.id);
    return NextResponse.json(providers.map(toProviderResponse));
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const admin = await requireAdminUser(request, database);
    const owner = getSettingsOwnerUser(database, admin);
    const body = await readJson<ProviderCreateBody>(request);
    const provider = await new ProviderService(database).create(owner.id, {
      name: body.name,
      providerType: body.provider_type,
      baseUrl: body.base_url,
      apiKey: body.api_key,
      config: body.config,
    });
    return NextResponse.json(toProviderResponse(provider), { status: 201 });
  });
}
