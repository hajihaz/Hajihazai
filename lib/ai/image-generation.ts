const PRIMARY_IMAGE_MODEL = "google/gemini-3.1-flash-image";
const FALLBACK_IMAGE_MODEL = "bytedance-seed/seedream-4.5";
const OPENROUTER_IMAGE_ENDPOINT = "https://openrouter.ai/api/v1/images";

export const IMAGE_ASPECT_RATIOS = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "3:2",
  "2:3",
  "21:9",
] as const;

export const IMAGE_SIZES = ["1K", "2K", "4K"] as const;

export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];
export type ImageSize = (typeof IMAGE_SIZES)[number];

export function isImageAspectRatio(value: unknown): value is ImageAspectRatio {
  return (
    typeof value === "string" &&
    IMAGE_ASPECT_RATIOS.includes(value as ImageAspectRatio)
  );
}

export function isImageSize(value: unknown): value is ImageSize {
  return typeof value === "string" && IMAGE_SIZES.includes(value as ImageSize);
}

export function buildImagePrompt(prompt: string): string {
  return [
    "Create a polished, production-quality image from the user's brief below.",
    "Prioritize strong composition, coherent lighting, accurate anatomy and geometry," +
      " realistic materials, clean edges, intentional typography when requested," +
      " and professional visual hierarchy.",
    "Do not add watermarks, captions, borders, UI chrome, or unrelated objects unless requested.",
    "Preserve the user's subject, mood, setting, and explicit constraints.",
    "User brief:",
    prompt.trim(),
  ].join("\n");
}

export async function generateImage(input: {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  imageSize: ImageSize;
  signal?: AbortSignal;
}) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("Image generation is not configured");

  const models = [PRIMARY_IMAGE_MODEL, FALLBACK_IMAGE_MODEL];
  let lastError = "Image generation failed";

  for (const model of models) {
    const response = await fetch(OPENROUTER_IMAGE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: buildImagePrompt(input.prompt),
        aspect_ratio: input.aspectRatio,
        resolution: input.imageSize,
        quality: "high",
        output_format: "png",
        n: 1,
      }),
      signal: input.signal ?? AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        "[image-generation] provider error",
        model,
        response.status,
        detail.slice(0, 500),
      );
      lastError = `Image generation failed (${response.status})`;
      continue;
    }

    const data = (await response.json()) as {
      data?: Array<{ b64_json?: string; media_type?: string }>;
    };
    const image = data.data?.[0];
    if (!image?.b64_json) {
      console.error("[image-generation] provider returned no image", model);
      lastError = "Image generation returned no image";
      continue;
    }

    return {
      dataUrl: `data:${image.media_type || "image/png"};base64,${image.b64_json}`,
      mimeType: image.media_type || "image/png",
      model,
    };
  }

  throw new Error(lastError);
}
