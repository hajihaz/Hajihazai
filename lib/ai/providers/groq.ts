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

/** Keep private reasoning out of the user-visible answer when a model emits
 * reasoning tags inside the content field. Groq may expose reasoning separately
 * on some models, but this also protects against providers that inline <think>.
 */
function cleanVisibleText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "")
    .replace(/^\s*<think>[\s\S]*$/i, "")
    .trim();
}

/**
 * Streaming chunks are already token-boundary text. Never trim them: model
 * tokens commonly carry the leading space before the next word, and trimming
 * every chunk turns `Hello world` into `Helloworld`.
 */
function cleanStreamText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<analysis>[\s\S]*?<\/analysis>/gi, "")
    .replace(/^<think>[\s\S]*$/i, "");
}

function modelParams(model: string) {
  if (model === "openai/gpt-oss-120b") {
    return {
      temperature: 0.5,
      max_completion_tokens: 4096,
      reasoning_effort: "medium" as const,
      // GPT-OSS exposes reasoning separately by default. Never return it to
      // the chat UI: the application needs only the final assistant answer.
      include_reasoning: false,
    };
  }
  if (model === "qwen/qwen3.6-27b") {
    return {
      temperature: 0.4,
      max_completion_tokens: 4096,
      // Qwen reasoning is otherwise emitted as <think> content by Groq.
      reasoning_format: "hidden" as const,
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
    return cleanVisibleText(data?.choices?.[0]?.message?.content);
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
          const text = cleanStreamText(json?.choices?.[0]?.delta?.content);
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
      text: cleanVisibleText(data?.choices?.[0]?.message?.content),
      toolCalls: parseOpenAIToolCalls(data),
    };
  },
};
