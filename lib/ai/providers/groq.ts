import type {
  ChatMessage,
  GenerateOptions,
  NativeToolDefinition,
  Provider,
} from "../types";
import { parseOpenAIToolCalls } from "../tool-calls";

/**
 * Groq — OpenAI-compatible chat completions (fast inference). Chat only;
 * Groq has no embeddings API. Supports native function calling.
 */
const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

function modelParams(model: string) {
  if (model === "qwen-qwq-32b") {
    return {
      temperature: 0.6,
      top_p: 0.95,
      reasoning_format: "parsed" as const,
      max_completion_tokens: 4096,
    };
  }
  return {};
}

function authHeaders(): Record<string, string> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("Groq: GROQ_API_KEY missing");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

export const groqProvider: Provider = {
  name: "groq",

  isAvailable() {
    return Boolean(process.env.GROQ_API_KEY);
  },

  async generate(model, messages: ChatMessage[], opts?: GenerateOptions) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model,
        messages,
        ...modelParams(model),
        stream: false,
        ...(opts?.jsonSchema ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  },

  async *generateStream(model: string, messages: ChatMessage[]) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ model, messages, ...modelParams(model), stream: true }),
    });
    if (!res.ok) throw new Error(`Groq stream error ${res.status}`);
    if (!res.body) throw new Error("Groq: no response body");

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
  },

  async generateWithTools(model, messages: ChatMessage[], tools: NativeToolDefinition[]) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        model,
        messages,
        ...modelParams(model),
        stream: false,
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
    });
    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    const data = await res.json();
    return {
      text: data?.choices?.[0]?.message?.content ?? "",
      toolCalls: parseOpenAIToolCalls(data),
    };
  },
};
