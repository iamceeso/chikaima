import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { PDFParse } from "pdf-parse";

import { chunkText, type ChunkPayload } from "../../chunking/index.js";
import { emptyExtractedAsset, type ExtractedAsset, type IngestibleResource, type ResourceProcessor } from "../types.js";

export class PdfProcessor implements ResourceProcessor {
  supports(resource: IngestibleResource, mimeType: string | null): boolean {
    return mimeType === "application/pdf" || extname(resource.name).toLowerCase() === ".pdf";
  }

  async extract(resource: IngestibleResource): Promise<ExtractedAsset> {
    let data: Buffer;
    try {
      data = await readFile(resource.filePath);
    } catch {
      return emptyExtractedAsset();
    }

    const parser = new PDFParse({ data: new Uint8Array(data) });
    try {
      const result = await parser.getText();
      const pages: string[] = [];
      const chunks: ChunkPayload[] = [];
      for (const page of result.pages) {
        const pageText = page.text.trim();
        if (!pageText) continue;
        pages.push(pageText);
        chunks.push(...chunkText(pageText, { page: page.num }));
      }
      return {
        content: pages.join("\n\n").trim(),
        metadata: { page_count: result.total },
        chunks,
      };
    } catch {
      return emptyExtractedAsset();
    } finally {
      await parser.destroy();
    }
  }
}
