import { existsSync, statSync } from "node:fs";
import { createReadStream } from "node:fs";
import { extname } from "node:path";
import { Readable } from "node:stream";

import { NextResponse, type NextRequest } from "next/server";

import { AssetService, type ResourceType } from "@/core/assets/assetService.js";
import { badRequest, notFound } from "@/core/errors.js";

import { db, handleRoute, requireUser } from "../../../../_lib/http.js";

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/m4a",
  ".ogg": "audio/ogg",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
};

const RESOURCE_TYPES: ReadonlySet<string> = new Set<ResourceType>(["document", "audio", "video"]);

type RouteContext = { params: Promise<{ resourceType: string; resourceId: string }> };

export async function GET(request: NextRequest, context: RouteContext): Promise<Response> {
  return handleRoute(async () => {
    const { resourceType, resourceId } = await context.params;
    if (!RESOURCE_TYPES.has(resourceType)) {
      throw badRequest("Unsupported resource type");
    }

    const database = db();
    const user = await requireUser(request, database);
    const resource = new AssetService(database).getResource(user.id, resourceType as ResourceType, resourceId);

    if (!existsSync(resource.filePath)) {
      throw notFound("Stored file not found");
    }

    const mediaType = "mimeType" in resource ? resource.mimeType : (EXTENSION_MIME_TYPES[extname(resource.filePath).toLowerCase()] ?? "application/octet-stream");
    const size = statSync(resource.filePath).size;
    const body = Readable.toWeb(createReadStream(resource.filePath)) as ReadableStream<Uint8Array>;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": mediaType,
        "Content-Length": String(size),
        "Content-Disposition": `inline; filename="${resource.name.replace(/"/g, "")}"`,
      },
    });
  });
}
