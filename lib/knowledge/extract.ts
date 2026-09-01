/** Text extraction from uploaded documents. TXT/MD are native; PDF/DOCX are
 *  pluggable (add pdf-parse / mammoth and wire below to activate). */

export const SUPPORTED_EXTS = ["pdf", "docx", "txt", "md"] as const;
export type DocExt = (typeof SUPPORTED_EXTS)[number];

export function extFromName(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export function isSupportedExt(ext: string): ext is DocExt {
  return (SUPPORTED_EXTS as readonly string[]).includes(ext);
}

export function extractText(
  ext: string,
  buf: Buffer,
): { ok: true; text: string } | { ok: false; error: string } {
  if (ext === "txt" || ext === "md") {
    return { ok: true, text: buf.toString("utf8") };
  }
  if (ext === "pdf" || ext === "docx") {
    return {
      ok: false,
      error: `${ext.toUpperCase()} parsing is not configured yet — upload TXT or MD, or paste the text.`,
    };
  }
  return { ok: false, error: `Unsupported file type: .${ext}` };
}
