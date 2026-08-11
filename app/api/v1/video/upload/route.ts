import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";
import { toVideoResponse } from "@/core/assets/assetResponses.js";
import { getConfig } from "@/core/config/index.js";
import { badRequest } from "@/core/errors.js";
import { JobDispatcher } from "@/core/jobs/dispatcher.js";
import { storageService } from "@/core/storage/storageService.js";

import { db, handleRoute, requireUser } from "../../_lib/http.js";

const ALLOWED_VIDEO_CONTENT_TYPES = new Set(["video/mp4", "video/quicktime", "video/x-matroska", "video/webm"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw badRequest("A file upload is required.");
    }

    const stored = await storageService.saveUpload(file, "video", {
      allowedContentTypes: ALLOWED_VIDEO_CONTENT_TYPES,
      maxSizeBytes: getConfig().videoUploadMaxBytes,
    });

    const video = new AssetService(database).createResource(user.id, "video", { name: stored.name, filePath: stored.filePath });
    new JobDispatcher(database).createJob(user.id, "video_analysis", video.id);

    return NextResponse.json(toVideoResponse(video), { status: 201 });
  });
}
