import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

/**
 * pdf-parse's underlying pdfjs-dist references `DOMMatrix`/`ImageData`/
 * `Path2D` (browser Canvas globals) even for plain text extraction, not
 * just rendering. It tries to load `@napi-rs/canvas` itself to polyfill
 * them, but does so via a `require()` wrapped in try/catch for ~10 platform
 * variants — a pattern file-tracers (`@vercel/nft`, used by Next's
 * `output: standalone`) can't follow, so that self-polyfill silently fails
 * in a standalone build and pdfjs-dist crashes with "DOMMatrix is not
 * defined". Importing `@napi-rs/canvas` here ourselves, as a plain static
 * import, makes it traceable, and setting the globals before `pdf-parse`
 * loads (this module must be imported first in `processors/pdf.ts`) means
 * pdfjs-dist finds them already defined and never attempts its own broken
 * polyfill.
 */
const globalScope = globalThis as unknown as { DOMMatrix?: unknown; ImageData?: unknown; Path2D?: unknown };

if (typeof globalScope.DOMMatrix === "undefined") {
  globalScope.DOMMatrix = DOMMatrix;
}
if (typeof globalScope.ImageData === "undefined") {
  globalScope.ImageData = ImageData;
}
if (typeof globalScope.Path2D === "undefined") {
  globalScope.Path2D = Path2D;
}
