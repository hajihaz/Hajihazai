/** Text extraction for uploaded knowledge documents. */

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
    try {
      // Load PDF.js only for PDF requests. The legacy build avoids browser-only
      // globals under the Next.js Node runtime and works for normal text PDFs.
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buf) });
      const doc = await loadingTask.promise;
      let text = "";
      for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
        const page = await doc.getPage(pageNo);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .trim();
        if (pageText) text += `${pageText}\n\n`;
      }
      await doc.destroy();
      return acceptExtractedText(text.trim());
    } catch (error) {
      console.warn("[knowledge] PDF extraction failed:", error);
      return { ok: false, error: "Could not read the PDF. Please check that it is a valid, text-readable PDF." };
    } finally {

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
