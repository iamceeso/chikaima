import { CodeProcessor } from "./processors/code.js";
import { ImageProcessor } from "./processors/image.js";
import { OfficeProcessor } from "./processors/office.js";
import { PdfProcessor } from "./processors/pdf.js";
import { TextProcessor } from "./processors/text.js";
import type { IngestibleResource, ResourceProcessor } from "./types.js";

/**
 * Handles non-audio/video ingestible resources (documents, code, images,
 * office files). Audio and video are routed to `core/media` directly by the
 * job pipeline, not through this registry — matching the Python backend's
 * `_process_resource_job`, which never reaches `processor_registry` for
 * those resource types even though `asset_processors.py` defines
 * (unreachable) Audio/VideoProcessor classes.
 */
export class DocumentProcessorRegistry {
  private readonly processors: ResourceProcessor[] = [new PdfProcessor(), new CodeProcessor(), new OfficeProcessor(), new ImageProcessor(), new TextProcessor()];

  select(resource: IngestibleResource, mimeType: string | null): ResourceProcessor {
    for (const processor of this.processors) {
      if (processor.supports(resource, mimeType)) {
        return processor;
      }
    }
    return new TextProcessor();
  }
}

export const documentProcessorRegistry = new DocumentProcessorRegistry();
