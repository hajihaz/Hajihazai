import { auth } from "@/auth";
import { rateLimitResponse } from "@/lib/ratelimit";
import { buildPdfFromSpec, extractPdfText, MAX_PDF_BYTES, MAX_TOTAL_PDF_BYTES, planPdfEdit } from "@/lib/pdf/studio";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`pdf-studio:${session.user.id}`, 5, 10 * 60_000);
  if (limited) return limited;
  const form = await req.formData().catch(() => null);
  const source = form?.get("source");
  const reference = form?.get("reference");
  const prompt = typeof form?.get("prompt") === "string" ? String(form?.get("prompt")).trim() : "";
  if (!(source instanceof File)) return Response.json({ error: "Upload a source PDF" }, { status: 400 });
  if (source.type !== "application/pdf" && !source.name.toLowerCase().endsWith(".pdf")) return Response.json({ error: "Source must be a PDF" }, { status: 400 });
  if (source.size > MAX_PDF_BYTES) return Response.json({ error: "Each PDF must be 12MB or smaller" }, { status: 413 });
  if (reference instanceof File && reference.size > MAX_PDF_BYTES) return Response.json({ error: "Each PDF must be 12MB or smaller" }, { status: 413 });
  if (reference instanceof File && source.size + reference.size > MAX_TOTAL_PDF_BYTES) return Response.json({ error: "Combined PDF upload must be 20MB or smaller" }, { status: 413 });
  if (!prompt) return Response.json({ error: "Tell HajiHaz what to change or create" }, { status: 400 });
  if (prompt.length > 8_000) return Response.json({ error: "Prompt exceeds 8,000 characters" }, { status: 413 });

  try {
    const sourceText = await extractPdfText(source);
    let referenceText: string | undefined;
    let referenceName: string | undefined;
    if (reference instanceof File && reference.size > 0) {
      referenceText = await extractPdfText(reference);
      referenceName = reference.name;
    }
    const spec = await planPdfEdit({ prompt, sourceName: source.name, sourceText, referenceName, referenceText });
    const bytes = await buildPdfFromSpec(spec);
    const filename = `${(spec.title || "hajihaz-document").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 70) || "hajihaz-document"}.pdf`;
    return new Response(Buffer.from(bytes), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store", "X-HajiHaz-PDF-Mode": referenceText ? "reference-transform" : "prompt-edit" } });
  } catch (error) {
    console.error("[pdf-studio] generation failed", error);
    const message = error instanceof Error ? error.message : "PDF generation failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
