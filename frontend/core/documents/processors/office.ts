import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import ExcelJS from "exceljs";
import JSZip from "jszip";
import mammoth from "mammoth";

import { chunkText, type ChunkPayload } from "../../chunking/index.js";
import { emptyExtractedAsset, type ExtractedAsset, type IngestibleResource, type ResourceProcessor } from "../types.js";

const OFFICE_EXTENSIONS = new Set([".docx", ".pptx", ".xlsx"]);

export class OfficeProcessor implements ResourceProcessor {
  supports(resource: IngestibleResource): boolean {
    return OFFICE_EXTENSIONS.has(extname(resource.name).toLowerCase());
  }

  async extract(resource: IngestibleResource): Promise<ExtractedAsset> {
    const suffix = extname(resource.name).toLowerCase();
    if (suffix === ".docx") return this.extractDocx(resource);
    if (suffix === ".pptx") return this.extractPptx(resource);
    if (suffix === ".xlsx") return this.extractXlsx(resource);
    return emptyExtractedAsset();
  }

  private async extractDocx(resource: IngestibleResource): Promise<ExtractedAsset> {
    let buffer: Buffer;
    try {
      buffer = await readFile(resource.filePath);
    } catch {
      return emptyExtractedAsset();
    }

    try {
      const { value } = await mammoth.extractRawText({ buffer });
      const text = value.trim();
      return { content: text, metadata: {}, chunks: chunkText(text) };
    } catch {
      return emptyExtractedAsset();
    }
  }

  private async extractPptx(resource: IngestibleResource): Promise<ExtractedAsset> {
    let buffer: Buffer;
    try {
      buffer = await readFile(resource.filePath);
    } catch {
      return emptyExtractedAsset();
    }

    try {
      const archive = await JSZip.loadAsync(buffer);
      const slideFiles = Object.keys(archive.files)
        .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
        .sort((a, b) => {
          const numA = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
          const numB = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
          return numA - numB;
        });

      const slides: string[] = [];
      const chunks: ChunkPayload[] = [];
      for (let index = 0; index < slideFiles.length; index += 1) {
        const xml = await archive.files[slideFiles[index]!]!.async("text");
        const texts = Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)).map((match) => this.decodeXmlEntities(match[1] ?? "").trim());
        const slideText = texts.filter(Boolean).join("\n").trim();
        if (!slideText) continue;
        slides.push(slideText);
        chunks.push(...chunkText(slideText, { slide: index + 1 }));
      }

      return { content: slides.join("\n\n").trim(), metadata: {}, chunks };
    } catch {
      return emptyExtractedAsset();
    }
  }

  private async extractXlsx(resource: IngestibleResource): Promise<ExtractedAsset> {
    let buffer: Buffer;
    try {
      buffer = await readFile(resource.filePath);
    } catch {
      return emptyExtractedAsset();
    }

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as never);

      const sheetTexts: string[] = [];
      const chunks: ChunkPayload[] = [];
      workbook.worksheets.forEach((sheet) => {
        const rows: string[] = [];
        sheet.eachRow((row) => {
          const values = (row.values as Array<unknown>)
            .slice(1) // exceljs row.values is 1-indexed; index 0 is always empty.
            .map((value) => this.cellToString(value))
            .filter((value) => value.trim().length > 0);
          if (values.length > 0) {
            rows.push(values.join(" | "));
          }
        });
        if (rows.length === 0) return;
        const sheetText = rows.join("\n");
        sheetTexts.push(`${sheet.name}\n${sheetText}`);
        chunks.push(...chunkText(sheetText, { sheet: sheet.name }));
      });

      return { content: sheetTexts.join("\n\n").trim(), metadata: {}, chunks };
    } catch {
      return emptyExtractedAsset();
    }
  }

  private cellToString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object" && "text" in (value as Record<string, unknown>)) {
      return String((value as { text: unknown }).text ?? "").trim();
    }
    if (typeof value === "object" && "result" in (value as Record<string, unknown>)) {
      return String((value as { result: unknown }).result ?? "").trim();
    }
    return String(value).trim();
  }

  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }
}
