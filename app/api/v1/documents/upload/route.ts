import { NextResponse, type NextRequest } from "next/server";

import { AssetService } from "@/core/assets/assetService.js";
import { toDocumentResponse } from "@/core/assets/assetResponses.js";
import { getConfig } from "@/core/config/index.js";
import { badRequest } from "@/core/errors.js";
import { JobDispatcher } from "@/core/jobs/dispatcher.js";
import { storageService } from "@/core/storage/storageService.js";

import { db, handleRoute, requireUser } from "../../_lib/http.js";

const ALLOWED_DOCUMENT_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/javascript",
  "text/javascript",
  "text/x-python",
  "text/x-java-source",
  "text/x-csharp",
  "text/x-go",
  "text/rust",
]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const database = db();
    const user = await requireUser(request, database);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw badRequest("A file upload is required.");
    }

    const stored = await storageService.saveUpload(file, "documents", {
      allowedContentTypes: ALLOWED_DOCUMENT_CONTENT_TYPES,
      maxSizeBytes: getConfig().documentUploadMaxBytes,
    });

    const document = new AssetService(database).createResource(user.id, "document", {
      name: stored.name,
      filePath: stored.filePath,
      mimeType: stored.contentType,
    });
    new JobDispatcher(database).createJob(user.id, "document_analysis", document.id);

    return NextResponse.json(toDocumentResponse(document), { status: 201 });
  });
}
