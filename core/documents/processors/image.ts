import { access } from "node:fs/promises";
import { extname } from "node:path";

import { recognize } from "tesseract.js";

import { chunkText } from "../../chunking/index.js";
import type { ExtractedAsset, IngestibleResource, ResourceProcessor } from "../types.js";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function fileExists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

export class ImageProcessor implements ResourceProcessor {
  supports(resource: IngestibleResource, mimeType: string | null): boolean {
    return IMAGE_EXTENSIONS.has(extname(resource.name).toLowerCase()) || Boolean(mimeType?.startsWith("image/"));
  }

  async extract(resource: IngestibleResource): Promise<ExtractedAsset> {
    let extractedText = "";
    if (await fileExists(resource.filePath)) {
      try {
        const { data } = await recognize(resource.filePath, "eng");
        extractedText = data.text.trim();
      } catch {
        // OCR is best-effort, matching the Python backend's `except Exception: extracted_text = ""`.
        extractedText = "";
      }
    }

    const description = `Image asset named ${resource.name}`;
    const combined = [description, extractedText].filter(Boolean).join("\n\n").trim();
    return {
      content: combined,
      metadata: { ocr_text: extractedText, description },
      chunks: chunkText(combined, { description }),
    };
  }
}
