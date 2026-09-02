import type { EmbeddingProvider } from "../types";

const base = () => process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api";

export const ollamaEmbeddingProvider: EmbeddingProvider = {
  name: "ollama",

  // Local-first: available in development; in production only if a gateway
  // URL is explicitly configured.
  isAvailable() {
    return process.env.NODE_ENV !== "production" || Boolean(process.env.OLLAMA_BASE_URL);
  },

  async embed(model, text) {
    const res = await fetch(`${base()}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Ollama embeddings error ${res.status}`);
    const data = await res.json();
    return data?.embedding ?? [];
  },
};
