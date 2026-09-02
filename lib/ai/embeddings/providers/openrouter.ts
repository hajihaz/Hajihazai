import type { EmbeddingProvider } from "../types";

const ENDPOINT = "https://openrouter.ai/api/v1/embeddings";

export const openrouterEmbeddingProvider: EmbeddingProvider = {
  name: "openrouter",

  isAvailable() {
    return Boolean(process.env.OPENROUTER_API_KEY);
  },

  async embed(model, text) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OpenRouter: OPENROUTER_API_KEY missing");

    // OpenAI-compatible embeddings endpoint.
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "HajiHaz AI",
      },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`OpenRouter embeddings error ${res.status}`);

    const data = await res.json();
    return data?.data?.[0]?.embedding ?? [];
  },
};
