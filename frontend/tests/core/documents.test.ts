import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import ExcelJS from "exceljs";
import JSZip from "jszip";

import type { IngestibleResource } from "../../core/documents/types.js";
import { CodeProcessor } from "../../core/documents/processors/code.js";
import { ImageProcessor } from "../../core/documents/processors/image.js";
import { OfficeProcessor } from "../../core/documents/processors/office.js";
import { PdfProcessor } from "../../core/documents/processors/pdf.js";
import { TextProcessor } from "../../core/documents/processors/text.js";
import { DocumentProcessorRegistry } from "../../core/documents/registry.js";

const MINIMAL_PDF = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 200 200] /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 20 100 Td (Hello World) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
trailer
<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;

async function withTempDir<T>(fn: (dir: string) => T | Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "chikaima-documents-test-"));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function resource(filePath: string, name = filePath.split("/").pop()!): IngestibleResource {
  return { id: "res-1", name, filePath, userId: "user-1" };
}

test("PdfProcessor extracts per-page text and chunk metadata", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "doc.pdf");
    writeFileSync(filePath, MINIMAL_PDF);

    const result = await new PdfProcessor().extract(resource(filePath));
    assert.equal(result.content, "Hello World");
    assert.equal(result.metadata.page_count, 1);
    assert.equal(result.chunks[0]?.metadata.page, 1);
  });
});

test("PdfProcessor degrades gracefully when the file is missing", async () => {
  const result = await new PdfProcessor().extract(resource("/nonexistent/doc.pdf"));
  assert.equal(result.content, "");
  assert.deepEqual(result.chunks, []);
});

test("TextProcessor reads and chunks plain text files", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "notes.md");
    writeFileSync(filePath, "# Title\n\nSome body text.");

    const result = await new TextProcessor().extract(resource(filePath));
    assert.equal(result.content, "# Title\n\nSome body text.");
    assert.equal(result.chunks.length, 1);
  });
});

test("CodeProcessor splits on top-level declaration boundaries", async () => {
  await withTempDir(async (dir) => {
    const filePath = join(dir, "util.ts");
    writeFileSync(filePath, "export function a() {\n  return 1;\n}\n\nexport function b() {\n  return 2;\n}\n");

    const result = await new CodeProcessor().extract(resource(filePath));
    assert.equal(result.metadata.language, "ts");
    assert.ok(result.chunks.length >= 2);
    assert.ok(result.chunks.every((chunk) => chunk.metadata.file_path === "util.ts"));
  });
});

test("OfficeProcessor extracts text from a minimal .docx", async () => {
  await withTempDir(async (dir) => {
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    );
    zip.file(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    );
    zip.file(
      "word/document.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from docx</w:t></w:r></w:p></w:body></w:document>',
    );
    const filePath = join(dir, "doc.docx");
    writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));

    const result = await new OfficeProcessor().extract(resource(filePath));
    assert.match(result.content, /Hello from docx/);
  });
});

test("OfficeProcessor extracts slide text in order from a minimal .pptx", async () => {
  await withTempDir(async (dir) => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      '<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide One</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    );
    zip.file(
      "ppt/slides/slide2.xml",
      '<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide Two</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    );
    const filePath = join(dir, "deck.pptx");
    writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));

    const result = await new OfficeProcessor().extract(resource(filePath));
    assert.equal(result.content, "Slide One\n\nSlide Two");
    assert.equal(result.chunks[0]?.metadata.slide, 1);
    assert.equal(result.chunks[1]?.metadata.slide, 2);
  });
});

test("OfficeProcessor extracts rows from a minimal .xlsx", async () => {
  await withTempDir(async (dir) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data");
    sheet.addRow(["Name", "Score"]);
    sheet.addRow(["Alice", 42]);
    const filePath = join(dir, "sheet.xlsx");
    writeFileSync(filePath, Buffer.from(await workbook.xlsx.writeBuffer()));

    const result = await new OfficeProcessor().extract(resource(filePath));
    assert.match(result.content, /Name \| Score/);
    assert.match(result.content, /Alice \| 42/);
    assert.equal(result.chunks[0]?.metadata.sheet, "Data");
  });
});

test("ImageProcessor falls back to a description-only asset when the file is missing", async () => {
  const result = await new ImageProcessor().extract(resource("/nonexistent/photo.png"));
  assert.equal(result.content, "Image asset named photo.png");
  assert.equal(result.metadata.ocr_text, "");
});

test("DocumentProcessorRegistry selects by extension/mime and falls back to TextProcessor", () => {
  const registry = new DocumentProcessorRegistry();
  assert.ok(registry.select(resource("a.pdf"), null) instanceof PdfProcessor);
  assert.ok(registry.select(resource("a.docx"), null) instanceof OfficeProcessor);
  assert.ok(registry.select(resource("a.png"), null) instanceof ImageProcessor);
  assert.ok(registry.select(resource("a.ts"), null) instanceof CodeProcessor);
  assert.ok(registry.select(resource("a.unknown-ext"), null) instanceof TextProcessor);
});
