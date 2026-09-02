import type {
  ChatMessage,
  GenerateOptions,
  NativeToolDefinition,
  Provider,
} from "../types";
import { parseGeminiToolCalls } from "../tool-calls";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const geminiProvider: Provider = {
  name: "gemini",

  isAvailable() {
    return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  },

  async generate(model, messages: ChatMessage[], opts?: GenerateOptions) {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Gemini: GOOGLE_GENERATIVE_AI_API_KEY missing");

    // Gemini uses systemInstruction + roles user/model.
    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        // Force JSON output when a schema is requested.
        ...(opts?.jsonSchema
          ? { generationConfig: { responseMimeType: "application/json" } }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Gemini error ${res.status}`);

    const data = await res.json();
    const parts: Array<{ text?: string }> =
      data?.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? "").join("");
  },

  async generateWithTools(model, messages: ChatMessage[], tools: NativeToolDefinition[]) {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Gemini: GOOGLE_GENERATIVE_AI_API_KEY missing");

    const system = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

    const functionDeclarations = tools.map((t) => {
      // Gemini rejects JSON-Schema meta keys ($schema, additionalProperties).
      const { $schema, additionalProperties, ...params } = t.parameters as Record<
        string,
        unknown
      >;
      void $schema;
      void additionalProperties;
      return { name: t.name, description: t.description, parameters: params };
    });

    const res = await fetch(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        tools: [{ functionDeclarations }],
      }),
    });
    if (!res.ok) throw new Error(`Gemini error ${res.status}`);
    const data = await res.json();
    const text = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? "")
      .join("");
    return { text, toolCalls: parseGeminiToolCalls(data) };
  },
};
