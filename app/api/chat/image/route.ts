import { auth } from "@/auth";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 4;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`image-analysis:${session.user.id}`, 12, 60_000);
  if (limited) return limited;
  const oversized = rejectOversizedBody(req, 45 * 1024 * 1024);
  if (oversized) return oversized;
  const form = await req.formData().catch(() => null);
  const prompt = typeof form?.get("prompt") === "string" ? String(form.get("prompt")).trim() : "Analyze these images carefully and describe what is relevant.";
  const files = form ? form.getAll("image").filter((v): v is File => v instanceof File) : [];
  if (!files.length || files.length > MAX_IMAGES) return Response.json({ error: `Attach 1-${MAX_IMAGES} images.` }, { status: 400 });
  const parts: Array<Record<string, unknown>> = [{ text: prompt.slice(0, 10_000) }];
  for (const file of files) {
    if (!ALLOWED.has(file.type) || file.size > MAX_IMAGE_BYTES) return Response.json({ error: `Unsupported or oversized image: ${file.name}` }, { status: 400 });
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    parts.push({ inlineData: { mimeType: file.type, data: base64 } });
  }
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return Response.json({ error: "Image understanding is not configured." }, { status: 503 });
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2 } }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return Response.json({ error: data?.error?.message || `Image analysis failed (HTTP ${res.status})` }, { status: 502 });
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("").trim();
  if (!text) return Response.json({ error: "The vision model returned no text." }, { status: 502 });
  return Response.json({ ok: true, text });
}
