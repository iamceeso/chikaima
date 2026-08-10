import { NextResponse, type NextRequest } from "next/server";

import { getSettingsOwnerUser } from "@/core/auth/deps.js";
import { WorkspaceService } from "@/core/auth/workspaceService.js";

import { db, handleRoute, readJson, requireAdminUser } from "../../_lib/http.js";

interface WorkspaceConfigUpdateBody {
  name?: string | null;
  authentication_enabled?: boolean | null;
  docs_enabled?: boolean | null;
  public_registration_enabled?: boolean | null;
  vision_aware?: boolean | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const admin = await requireAdminUser(request, database);
    const owner = getSettingsOwnerUser(database, admin);
    return NextResponse.json(new WorkspaceService(database).getSummary(owner));
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const admin = await requireAdminUser(request, database);
    const owner = getSettingsOwnerUser(database, admin);
    const body = await readJson<WorkspaceConfigUpdateBody>(request);
    const summary = new WorkspaceService(database).update(
      admin,
      {
        name: body.name,
        authenticationEnabled: body.authentication_enabled,
        docsEnabled: body.docs_enabled,
        publicRegistrationEnabled: body.public_registration_enabled,
        visionAware: body.vision_aware,
      },
      owner,
    );
    return NextResponse.json(summary);
  });
}
