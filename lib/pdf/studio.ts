import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { extractText } from "@/lib/knowledge/extract";
import { extFromName } from "@/lib/knowledge/extract";
import { routeChat } from "@/lib/ai/router";

export const MAX_PDF_BYTES = 12 * 1024 * 1024;
export const MAX_TOTAL_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_SOURCE_CHARS = 600_000;

export type PdfBlock =
  | { type: "title" | "heading" | "subheading"; text: string }
  | { type: "paragraph" | "quote"; text: string }
  | { type: "bullet" | "numbered"; text: string }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "pageBreak" };

export type PdfSpec = {
  title: string;
  subtitle?: string;
  author?: string;
  pageSize?: "a4" | "letter" | "legal";
  margins?: { top: number; right: number; bottom: number; left: number };
  blocks: PdfBlock[];
};

const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
} as const;

function cleanText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function normalizeSpec(raw: unknown): PdfSpec {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const blocksRaw = Array.isArray(value.blocks) ? value.blocks : [];
  const blocks: PdfBlock[] = [];
  for (const item of blocksRaw) {
    if (!item || typeof item !== "object") continue;
    const b = item as Record<string, unknown>;
    const type = String(b.type ?? "paragraph");
    if (type === "pageBreak") { blocks.push({ type: "pageBreak" }); continue; }
    if (type === "table") {
      const headers = Array.isArray(b.headers) ? b.headers.map(cleanText).filter(Boolean) : [];
      const rows = Array.isArray(b.rows) ? b.rows.map((row) => Array.isArray(row) ? row.map(cleanText) : []).filter((r) => r.length) : [];
      if (headers.length) blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (["title", "heading", "subheading", "paragraph", "quote", "bullet", "numbered"].includes(type)) {
      const text = cleanText(b.text);
      if (text) blocks.push({ type: type as Exclude<PdfBlock, { type: "table" | "pageBreak" }>["type"], text });
    }
  }
  return {
    title: cleanText(value.title) || "HajiHaz Document",
    subtitle: cleanText(value.subtitle),
    author: cleanText(value.author),
    pageSize: value.pageSize === "letter" || value.pageSize === "legal" ? value.pageSize : "a4",
    margins: {
      top: Math.max(36, Number((value.margins as any)?.top) || 54),
      right: Math.max(36, Number((value.margins as any)?.right) || 54),
      bottom: Math.max(40, Number((value.margins as any)?.bottom) || 54),
      left: Math.max(36, Number((value.margins as any)?.left) || 54),
    },
    blocks: blocks.length ? blocks : [{ type: "paragraph", text: "No document content was generated." }],
  };
}

function asciiSafe(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/•/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = asciiSafe(text).replace(/\s+/g, " ").trim();
  if (!clean) return [""];
  const words = clean.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
    else if (current) { lines.push(current); current = word; }
    else {
      let part = "";
      for (const ch of word) {
        const next = part + ch;
        if (font.widthOfTextAtSize(next, size) > maxWidth && part) { lines.push(part); part = ch; }
        else part = next;
      }
      current = part;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, width: number, font: PDFFont, size: number, lineHeight: number): number {
  const lines = wrapText(text, font, size, width);
  let cursor = y;
  for (const line of lines) { page.drawText(line, { x, y: cursor, size, font }); cursor -= lineHeight; }
  return cursor;
}

export async function buildPdfFromSpec(specInput: PdfSpec): Promise<Uint8Array> {
  const spec = normalizeSpec(specInput);
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const [pageW, pageH] = PAGE_SIZES[spec.pageSize ?? "a4"];
  const m = spec.margins!;
  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - m.top;
  let pageNo = 1;

  const addPage = () => {
    page = pdf.addPage([pageW, pageH]);
    pageNo += 1;
    y = pageH - m.top;
  };
  const ensure = (needed: number) => { if (y - needed < m.bottom + 24) addPage(); };
  const footer = (p: PDFPage, n: number) => {
    p.drawLine({ start: { x: m.left, y: 27 }, end: { x: pageW - m.right, y: 27 }, thickness: 0.5, color: rgb(0.82, 0.82, 0.82) });
    const label = `HajiHaz AI  |  ${n}`;
    p.drawText(label, { x: pageW - m.right - regular.widthOfTextAtSize(label, 8), y: 14, size: 8, font: regular, color: rgb(0.45, 0.45, 0.45) });
  };

  if (spec.title) {
    ensure(80);
    const titleLines = wrapText(spec.title, bold, 25, pageW - m.left - m.right);
    for (const line of titleLines) { page.drawText(line, { x: m.left, y, size: 25, font: bold }); y -= 31; }
    if (spec.subtitle) { y -= 4; y = drawWrapped(page, spec.subtitle, m.left, y, pageW - m.left - m.right, regular, 11, 16) - 6; }
    if (spec.author) { page.drawText(asciiSafe(spec.author), { x: m.left, y, size: 9, font: italic, color: rgb(0.38,0.38,0.38) }); y -= 22; }
    page.drawLine({ start: { x: m.left, y }, end: { x: pageW - m.right, y }, thickness: 1, color: rgb(0.25,0.25,0.25) });
    y -= 24;
  }

  for (const block of spec.blocks) {
    if (block.type === "pageBreak") { addPage(); continue; }
    if (block.type === "title") {
      ensure(45); y = drawWrapped(page, block.text, m.left, y, pageW - m.left - m.right, bold, 20, 25) - 12; continue;
    }
    if (block.type === "heading") {
      ensure(42); y -= 8; y = drawWrapped(page, block.text, m.left, y, pageW - m.left - m.right, bold, 15, 20) - 9; continue;
    }
    if (block.type === "subheading") {
      ensure(32); y -= 4; y = drawWrapped(page, block.text, m.left, y, pageW - m.left - m.right, bold, 11.5, 16) - 5; continue;
    }
    if (block.type === "quote") {
      const lines = wrapText(block.text, italic, 10.5, pageW - m.left - m.right - 24);
      ensure(lines.length * 15 + 10);
      page.drawLine({ start: { x: m.left + 4, y: y + 3 }, end: { x: m.left + 4, y: y - lines.length * 15 + 6 }, thickness: 2, color: rgb(0.55,0.55,0.55) });
      y = drawWrapped(page, block.text, m.left + 16, y, pageW - m.left - m.right - 16, italic, 10.5, 15) - 10; continue;
    }
    if (block.type === "bullet" || block.type === "numbered") {
      const prefix = block.type === "bullet" ? "-" : "1.";
      const lines = wrapText(block.text, regular, 10.5, pageW - m.left - m.right - 26);
      ensure(lines.length * 15 + 7);
      page.drawText(prefix, { x: m.left, y, size: 10.5, font: regular });
      y = drawWrapped(page, block.text, m.left + 18, y, pageW - m.left - m.right - 18, regular, 10.5, 15) - 6; continue;
    }
    if (block.type === "paragraph") {
      const lines = wrapText(block.text, regular, 10.5, pageW - m.left - m.right);
      ensure(lines.length * 15 + 8);
      y = drawWrapped(page, block.text, m.left, y, pageW - m.left - m.right, regular, 10.5, 15) - 9; continue;
    }
    if (block.type === "table") {
      const cols = Math.max(1, block.headers.length);
      const widths = Array.from({ length: cols }, () => (pageW - m.left - m.right) / cols);
      const drawRow = (cells: string[], header: boolean) => {
        const lineSets = cells.map((c, i) => wrapText(c, header ? bold : regular, 8.5, widths[i] - 10));
        const rowH = Math.max(24, Math.max(...lineSets.map((a) => a.length)) * 11 + 9);
        ensure(rowH + 2);
        let x = m.left;
        for (let i=0;i<cols;i++) {
          page.drawRectangle({ x, y: y-rowH, width: widths[i], height: rowH, borderWidth: 0.5, borderColor: rgb(0.75,0.75,0.75), color: header ? rgb(0.94,0.94,0.94) : rgb(1,1,1) });
          const lines = lineSets[i] ?? [""];
          let ty = y - 14;
          for (const line of lines) { page.drawText(line, { x: x+5, y: ty, size: 8.5, font: header ? bold : regular }); ty -= 11; }
          x += widths[i];
        }
        y -= rowH;
      };
      drawRow(block.headers, true);
      for (const row of block.rows) drawRow([...row, ...Array(Math.max(0, cols-row.length)).fill("")].slice(0, cols), false);
      y -= 10;
    }
  }
  for (const p of pdf.getPages()) footer(p, pdf.getPages().indexOf(p)+1);
  return pdf.save();
}

export async function extractPdfText(file: File): Promise<string> {
  if (file.size > MAX_PDF_BYTES) throw new Error(`PDF exceeds ${MAX_PDF_BYTES / 1024 / 1024}MB`);
  const buf = Buffer.from(await file.arrayBuffer());
  const result = await extractText(extFromName(file.name), buf);
  if (!result.ok) throw new Error(result.error);
  const text = result.text.slice(0, MAX_SOURCE_CHARS);
  if (!text.trim()) throw new Error("This PDF has no extractable text. Scanned/image-only PDFs are not supported yet.");
  return text;
}

function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = (fenced ?? text).trim();
  try { return JSON.parse(candidate); } catch {
    const start = candidate.indexOf("{"); const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end+1));
    throw new Error("AI returned an invalid document plan");
  }
}

export async function planPdfEdit(args: { prompt: string; sourceName: string; sourceText: string; referenceName?: string; referenceText?: string }): Promise<PdfSpec> {
  const reference = args.referenceText ? `\n\nREFERENCE PDF (${args.referenceName}):\n${args.referenceText.slice(0, MAX_SOURCE_CHARS)}` : "";
  const system = `You are HajiHaz PDF Studio, an expert document editor and publishing designer. Create a production-quality PDF plan from the user's instruction and supplied PDF text. Preserve requested facts, names, numbers, legal wording, headings and ordering unless the user explicitly asks to change them. If a reference PDF is supplied, imitate its document architecture, hierarchy, density, section flow and professional visual style without copying protected prose unless the user asks to transform their supplied text. Output ONLY valid JSON matching this shape: {title:string,subtitle?:string,author?:string,pageSize:"a4"|"letter"|"legal",margins:{top:number,right:number,bottom:number,left:number},blocks:Array<{type:"title"|"heading"|"subheading"|"paragraph"|"bullet"|"numbered"|"quote"|"table"|"pageBreak",text?:string,headers?:string[],rows?:string[][]}>}. Use pageBreak sparingly. For tables, keep columns concise. Do not invent personal details or citations. Make the result ready to render. `;
  const user = `USER INSTRUCTION:\n${args.prompt}\n\nSOURCE PDF (${args.sourceName}):\n${args.sourceText}${reference}`;
  const result = await routeChat([{ role: "system", content: system }, { role: "user", content: user }]);
  const parsed = parseJson(result.text);
  return normalizeSpec(parsed);
}
