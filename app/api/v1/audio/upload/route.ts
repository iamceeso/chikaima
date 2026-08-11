import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";
import { toAudioResponse } from "@/core/assets/assetResponses.js";
import { getConfig } from "@/core/config/index.js";
import { badRequest } from "@/core/errors.js";
import { JobDispatcher } from "@/core/jobs/dispatcher.js";
import { storageService } from "@/core/storage/storageService.js";

import { db, handleRoute, requireUser } from "../../_lib/http.js";

const ALLOWED_AUDIO_CONTENT_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm", "audio/ogg", "audio/m4a"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw badRequest("A file upload is required.");
    }

    const stored = await storageService.saveUpload(file, "audio", {
      allowedContentTypes: ALLOWED_AUDIO_CONTENT_TYPES,
      maxSizeBytes: getConfig().audioUploadMaxBytes,
    });

    const asset = new AssetService(database).createResource(user.id, "audio", { name: stored.name, filePath: stored.filePath });
    new JobDispatcher(database).createJob(user.id, "audio_transcription", asset.id);

    return NextResponse.json(toAudioResponse(asset), { status: 201 });
  });
}
