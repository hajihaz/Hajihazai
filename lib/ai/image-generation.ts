const PRIMARY_GOOGLE_MODEL = "gemini-3.1-flash-image";
const PRO_GOOGLE_MODEL = "gemini-3-pro-image";
const OPENROUTER_IMAGE_MODELS = ["google/gemini-3.1-flash-image", "bytedance-seed/seedream-4.5"] as const;
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2.5-flare";
const GOOGLE_INTERACTIONS_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const OPENAI_IMAGE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const OPENROUTER_IMAGE_ENDPOINT = "https://openrouter.ai/api/v1/images";

export const IMAGE_ASPECT_RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9"] as const;
export const IMAGE_SIZES = ["1K", "2K", "4K"] as const;
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];
export type ImageSize = (typeof IMAGE_SIZES)[number];

export function isImageAspectRatio(value: unknown): value is ImageAspectRatio {
  return typeof value === "string" && IMAGE_ASPECT_RATIOS.includes(value as ImageAspectRatio);
}
export function isImageSize(value: unknown): value is ImageSize {
  return typeof value === "string" && IMAGE_SIZES.includes(value as ImageSize);
}

export function buildImagePrompt(prompt: string): string {
  return [
    "Create a polished, production-quality image from the user's brief below.",
    "Reason carefully about composition before rendering. Prioritize strong composition and visual hierarchy,",
    "coherent lighting, accurate anatomy and geometry, realistic materials, clean edges,",
    "natural depth, convincing perspective, and intentional typography when requested.",
    "Make the result feel art-directed rather than generic: choose a deliberate camera angle,",
    "lens/visual language, lighting design, color harmony, focal point, and background treatment",
    "that serve the brief. Preserve the user's subject, mood, setting, and explicit constraints.",
    "Do not add watermarks, captions, borders, UI chrome, logos, or unrelated objects unless requested.",
    "User brief:",
    prompt.trim(),
  ].join("\n");
}

export function openAIImageSizeForRatio(aspectRatio: ImageAspectRatio):
  | "1024x1024"
  | "1536x1024"
  | "1024x1536" {
  if (["3:4", "9:16", "2:3"].includes(aspectRatio)) return "1024x1536";
  if (["4:3", "16:9", "3:2", "21:9"].includes(aspectRatio)) return "1536x1024";
  return "1024x1024";
}

function openAIQualityForSize(imageSize: ImageSize): "low" | "medium" | "high" {
  if (imageSize === "1K") return "low";
  if (imageSize === "4K") return "high";
  return "medium";
}

async function generateWithGoogle(input: { prompt: string; aspectRatio: ImageAspectRatio; imageSize: ImageSize; signal?: AbortSignal }) {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return null;
  const models = input.imageSize === "4K" ? [PRO_GOOGLE_MODEL, PRIMARY_GOOGLE_MODEL] : [PRIMARY_GOOGLE_MODEL];

  for (const model of models) {
    const response = await fetch(GOOGLE_INTERACTIONS_ENDPOINT, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ type: "text", text: buildImagePrompt(input.prompt) }],
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: input.aspectRatio,
          image_size: input.imageSize,
        },
      }),
      signal: input.signal ?? AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[image-generation] Google provider error", model, response.status, detail.slice(0, 500));
      continue;
    }
    const data = (await response.json()) as { output_image?: { data?: string; mime_type?: string } };
    const base64 = data.output_image?.data;
    if (!base64) {
      console.error("[image-generation] Google returned no image", model);
      continue;
    }
    return {
      dataUrl: `data:${data.output_image?.mime_type || "image/png"};base64,${base64}`,
      mimeType: data.output_image?.mime_type || "image/png",
      model,
    };
  }
  return null;
}

async function generateWithOpenAI(input: { prompt: string; aspectRatio: ImageAspectRatio; imageSize: ImageSize; signal?: AbortSignal }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const response = await fetch(OPENAI_IMAGE_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt: `${buildImagePrompt(input.prompt)}\nTarget composition: ${input.aspectRatio} aspect ratio.`,
      size: openAIImageSizeForRatio(input.aspectRatio),
      quality: openAIQualityForSize(input.imageSize),
      output_format: "png",
      n: 1,
    }),
    signal: input.signal ?? AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[image-generation] OpenAI provider error", OPENAI_IMAGE_MODEL, response.status, detail.slice(0, 500));
    return null;
  }
  const data = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const base64 = data.data?.[0]?.b64_json;
  if (!base64) {
    console.error("[image-generation] OpenAI returned no image", OPENAI_IMAGE_MODEL);
    return null;
  }
  return { dataUrl: `data:image/png;base64,${base64}`, mimeType: "image/png", model: OPENAI_IMAGE_MODEL };
}

async function generateWithOpenRouter(input: { prompt: string; aspectRatio: ImageAspectRatio; imageSize: ImageSize; signal?: AbortSignal }) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  for (const model of OPENROUTER_IMAGE_MODELS) {
    const response = await fetch(OPENROUTER_IMAGE_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: buildImagePrompt(input.prompt), aspect_ratio: input.aspectRatio, resolution: input.imageSize, quality: "high", output_format: "png", n: 1 }),
      signal: input.signal ?? AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[image-generation] OpenRouter provider error", model, response.status, detail.slice(0, 500));
      continue;
    }
    const data = (await response.json()) as { data?: Array<{ b64_json?: string; media_type?: string }> };
    const image = data.data?.[0];
    if (!image?.b64_json) continue;
    return { dataUrl: `data:${image.media_type || "image/png"};base64,${image.b64_json}`, mimeType: image.media_type || "image/png", model };
  }
  return null;
}

export async function generateImage(input: { prompt: string; aspectRatio: ImageAspectRatio; imageSize: ImageSize; signal?: AbortSignal }) {
  const google = await generateWithGoogle(input);
  if (google) return google;
  const openAI = await generateWithOpenAI(input);
  if (openAI) return openAI;
  const openRouter = await generateWithOpenRouter(input);
  if (openRouter) return openRouter;
  throw new Error("Image generation failed across configured providers");
}
