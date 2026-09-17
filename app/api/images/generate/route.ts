import { auth } from "@/auth";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import {
  generateImage,
  isImageAspectRatio,
  isImageSize,
} from "@/lib/ai/image-generation";

const MAX_PROMPT_CHARS = 4_000;
const IMAGE_RATE_LIMIT = 6;
const IMAGE_RATE_WINDOW_MS = 10 * 60_000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const limited = await rateLimitResponse(
    `image-generation:${session.user.id}`,
    IMAGE_RATE_LIMIT,
    IMAGE_RATE_WINDOW_MS,
  );
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 16 * 1024);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const aspectRatio = body?.aspectRatio;
  const imageSize = body?.imageSize;

  if (!prompt) return new Response("Prompt is required", { status: 400 });
  if (prompt.length > MAX_PROMPT_CHARS) {
    return new Response(`prompt exceeds ${MAX_PROMPT_CHARS} characters`, {
      status: 413,
    });
  }
  if (!isImageAspectRatio(aspectRatio) || !isImageSize(imageSize)) {
    return new Response("Invalid image settings", { status: 400 });
  }

  try {
    const result = await generateImage({
      prompt,
      aspectRatio,
      imageSize,
      signal: AbortSignal.timeout(90_000),
    });

    return Response.json({
      ok: true,
      image: result.dataUrl,
      mimeType: result.mimeType,
      model: "image",
      aspectRatio,
      imageSize,
    });
  } catch (error) {
    console.error("[image-generation] request failed", error);
    return Response.json(
      { ok: false, error: "Image generation failed. Please try again." },
      { status: 502 },
    );
  }
}
