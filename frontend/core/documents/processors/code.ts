import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { chunkText, type ChunkPayload } from "../../chunking/index.js";
import { emptyExtractedAsset, type ExtractedAsset, type IngestibleResource, type ResourceProcessor } from "../types.js";

const CODE_EXTENSIONS = new Set([".js", ".ts", ".tsx", ".jsx", ".py", ".cs", ".java", ".go", ".rs"]);

/**
 * Chunks by top-level declaration boundaries (class/function/interface/etc),
 * matching the Python backend's `_chunk_generic` fallback. The Python
 * backend additionally does Python-AST-aware chunking for `.py` files
 * specifically (splitting on function/class nodes via `ast.parse`); that
 * has no direct TypeScript equivalent and is not ported here (see the
 * migration audit, "Behavior That Could Change During Migration") — `.py`
 * files fall back to this same generic splitter, same as every other
 * source language.
 */
export class CodeProcessor implements ResourceProcessor {
  supports(resource: IngestibleResource): boolean {
    return CODE_EXTENSIONS.has(extname(resource.name).toLowerCase());
  }

  async extract(resource: IngestibleResource): Promise<ExtractedAsset> {
    let text: string;
    try {
      text = await readFile(resource.filePath, "utf8");
    } catch {
      return emptyExtractedAsset();
    }

    const extension = extname(resource.filePath).toLowerCase();
    const chunks = this.chunkGeneric(text, resource.name);
    return {
      content: text.trim(),
      metadata: { language: extension.replace(/^\./, "") },
      chunks: chunks.length > 0 ? chunks : chunkText(text, { file_path: resource.name }),
    };
  }

  private chunkGeneric(text: string, filename: string): ChunkPayload[] {
    const sections = text.split(/\n(?=(?:export\s+)?(?:class|function|interface|type|struct|impl)\b)/);
    return sections
      .map((section, index) => ({ content: section.trim(), metadata: { file_path: filename, section_index: index } }))
      .filter((chunk) => chunk.content.length > 0);
  }
}
