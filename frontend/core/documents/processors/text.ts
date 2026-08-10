import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { chunkText } from "../../chunking/index.js";
import { emptyExtractedAsset, type ExtractedAsset, type IngestibleResource, type ResourceProcessor } from "../types.js";

const SUPPORTED_MIME_TYPES = new Set(["text/plain", "text/markdown", "application/json", "application/xml"]);
const SUPPORTED_EXTENSIONS = new Set([".txt", ".md", ".json", ".xml"]);

export class TextProcessor implements ResourceProcessor {
  supports(resource: IngestibleResource, mimeType: string | null): boolean {
    return (mimeType && SUPPORTED_MIME_TYPES.has(mimeType)) || SUPPORTED_EXTENSIONS.has(extname(resource.name).toLowerCase());
  }

  async extract(resource: IngestibleResource): Promise<ExtractedAsset> {
    let text: string;
    try {
      text = (await readFile(resource.filePath, "utf8")).trim();
    } catch {
      return emptyExtractedAsset();
    }
    return { content: text, metadata: {}, chunks: chunkText(text) };
  }
}
