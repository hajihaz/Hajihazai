/** Text extraction for uploaded knowledge documents. */

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export const SUPPORTED_EXTS = ["pdf", "docx", "txt", "md"] as const;
export const MAX_EXTRACTED_CHARS = 2_000_000;

function acceptExtractedText(text: string): { ok: true; text: string } | { ok: false; error: string } {
  if (text.length > MAX_EXTRACTED_CHARS) {
    return { ok: false, error: `The document contains too much extracted text (maximum ${MAX_EXTRACTED_CHARS.toLocaleString()} characters). Please split it into smaller files.` };
  }
  return { ok: true, text };
}
export type DocExt = (typeof SUPPORTED_EXTS)[number];

export function extFromName(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export function isSupportedExt(ext: string): ext is DocExt {
  return (SUPPORTED_EXTS as readonly string[]).includes(ext);
}

export async function extractText(
  ext: string,
  buf: Buffer,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (ext === "txt" || ext === "md") {
    return acceptExtractedText(buf.toString("utf8"));
  }

  if (ext === "pdf") {
    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      return acceptExtractedText(result.text);
    } catch (error) {
      console.warn("[knowledge] PDF extraction failed:", error);
      return { ok: false, error: "Could not read the PDF. Please check that it is a valid, text-readable PDF." };
    } finally {
      await parser?.destroy().catch(() => undefined);
    }
  }

  if (ext === "docx") {
    try {
      const result = await mammoth.extractRawText({ buffer: buf });
      return acceptExtractedText(result.value);
    } catch (error) {
      console.warn("[knowledge] DOCX extraction failed:", error);
      return { ok: false, error: "Could not read the DOCX file. Please check that it is a valid document." };
    }
  }

  return { ok: false, error: `Unsupported file type: .${ext}` };
}
