import { NextResponse, type NextRequest } from "next/server";

import { ProviderService } from "@/core/providers/providerService.js";

import { db, handleRoute, requireUser } from "../_lib/http.js";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    const models = new ProviderService(database).listAvailableModelsForUser(user.id);
    return NextResponse.json(models);
  });
}
