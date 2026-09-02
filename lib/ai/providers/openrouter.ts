import type {
  ChatMessage,
  GenerateOptions,
  NativeToolDefinition,
  Provider,
} from "../types";
import { parseOpenAIToolCalls } from "../tool-calls";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export const openrouterProvider: Provider = {
  name: "openrouter",

  isAvailable() {
    return Boolean(process.env.OPENROUTER_API_KEY);
  },

  async generate(model, messages: ChatMessage[], opts?: GenerateOptions) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OpenRouter: OPENROUTER_API_KEY missing");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "HajiHaz AI",
      },
      // OpenRouter is OpenAI-compatible — roles map 1:1.
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        // Reasoning-capable OpenRouter models may expose thinking separately.
        // Exclude it so only the final assistant answer enters chat history.
        reasoning: { exclude: true },
        ...(opts?.jsonSchema ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}`);

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  },

  async *generateStream(model: string, messages: ChatMessage[]) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OpenRouter: OPENROUTER_API_KEY missing");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "HajiHaz AI",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        reasoning: { exclude: true },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`OpenRouter stream error ${res.status}`);
    if (!res.body) throw new Error("OpenRouter: no response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const text: string = json?.choices?.[0]?.delta?.content ?? "";
          if (text) yield text;
        } catch { /* skip malformed chunk */ }
      }
    }
    const finalLine = buf.trim();
    if (finalLine.startsWith("data: ")) {
      const data = finalLine.slice(6);
      if (data !== "[DONE]") {
        try {
          const json = JSON.parse(data);
          const text: string = json?.choices?.[0]?.delta?.content ?? "";
          if (text) yield text;
        } catch { /* ignore incomplete final event */ }
      }
    }
  },

  async generateWithTools(model, messages: ChatMessage[], tools: NativeToolDefinition[]) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error("OpenRouter: OPENROUTER_API_KEY missing");

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
        "X-Title": "HajiHaz AI",
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        reasoning: { exclude: true },
        tool_choice: "auto",
        tools: tools.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`OpenRouter error ${res.status}`);
    const data = await res.json();
    return {
      text: data?.choices?.[0]?.message?.content ?? "",
      toolCalls: parseOpenAIToolCalls(data),
    };
  },
};
