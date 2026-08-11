import { NextResponse, type NextRequest } from "next/server";

import { getSettingsOwnerUser } from "@/core/auth/deps.js";
import { WorkspaceService } from "@/core/auth/workspaceService.js";

import { db, handleRoute, readJson, requireAdminUser, requireUser } from "../../_lib/http.js";

interface WorkspaceModelVisibilityBody {
  enabled_model_ids?: string[];
  default_model_id?: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);
    const owner = getSettingsOwnerUser(database, user);
    return NextResponse.json(new WorkspaceService(database).listModels(owner));
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const admin = await requireAdminUser(request, database);
    const owner = getSettingsOwnerUser(database, admin);
    const body = await readJson<WorkspaceModelVisibilityBody>(request);
    const models = new WorkspaceService(database).updateModelVisibility(
      admin,
      {
        enabledModelIds: body.enabled_model_ids ?? [],
        defaultModelId: body.default_model_id ?? null,
        defaultModelIdProvided: Object.prototype.hasOwnProperty.call(body, "default_model_id"),
      },
      owner,
    );
    return NextResponse.json(models);
  });
}
