import type {
  ChatMessage,
  GenerateOptions,
  NativeToolDefinition,
  Provider,
} from "../types";
import { parseOllamaToolCalls } from "../tool-calls";

const base = () => process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api";

export const ollamaProvider: Provider = {
  name: "ollama",

  // Local-first: always considered available in development; in production
  // only if a gateway URL is explicitly configured.
  isAvailable() {
    return process.env.NODE_ENV !== "production" || Boolean(process.env.OLLAMA_BASE_URL);
  },

  async generate(model, messages: ChatMessage[], opts?: GenerateOptions) {
    const body: Record<string, unknown> = { model, messages, stream: false };
    // Ollama supports structured outputs via a JSON schema in `format`.
    if (opts?.jsonSchema) body.format = opts.jsonSchema;

    const res = await fetch(`${base()}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const data = await res.json();
    return data?.message?.content ?? "";
  },

  async generateWithTools(model, messages: ChatMessage[], tools: NativeToolDefinition[]) {
    const res = await fetch(`${base()}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const data = await res.json();
    return { text: data?.message?.content ?? "", toolCalls: parseOllamaToolCalls(data) };
  },
};
