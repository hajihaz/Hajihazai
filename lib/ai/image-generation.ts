const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1/models";

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
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("Image generation is not configured");

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildImagePrompt(input.prompt) }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          responseFormat: {
            image: {
              aspectRatio: input.aspectRatio,
              imageSize: input.imageSize,
            },
          },
        },
      }),
      signal: input.signal ?? AbortSignal.timeout(90_000),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "[image-generation] provider error",
      response.status,
      detail.slice(0, 500),
    );
    throw new Error("Image generation failed");
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
      };
    }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const image = parts.find((part) => part.inlineData?.data)?.inlineData;
  if (!image?.data) throw new Error("Image generation returned no image");

  return {
    dataUrl: `data:${image.mimeType || "image/png"};base64,${image.data}`,
    mimeType: image.mimeType || "image/png",
    model: GEMINI_IMAGE_MODEL,
  };
}
