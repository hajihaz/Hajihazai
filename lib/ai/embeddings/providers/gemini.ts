import type { EmbeddingProvider } from "../types";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const geminiEmbeddingProvider: EmbeddingProvider = {
  name: "gemini",

  isAvailable() {
    return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  },

  async embed(model, text) {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Gemini: GOOGLE_GENERATIVE_AI_API_KEY missing");

    const res = await fetch(`${ENDPOINT}/${model}:embedContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        // Pin output dimension to the canonical size.
        outputDimensionality: 768,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Gemini embeddings error ${res.status}`);

    const data = await res.json();
    return data?.embedding?.values ?? [];
  },
};
