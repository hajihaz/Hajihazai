import type { ProviderName } from "./types";

/**
 * Model registry — the single source of truth for selectable models.
 * Pure data (no secrets), so it is safe to import in client components
 * to render the model selector.
 */
export interface ModelEntry {
  modelId: string; // HajiHaz-facing id / registry key
  provider: ProviderName;
  model: string; // provider-native model name used in the API call
  displayName: string;
  contextWindow: number;
  enabled: boolean;
}

export const MODEL_REGISTRY: ModelEntry[] = [
  {
    modelId: "ollama:qwen2.5",
    provider: "ollama",
    model: "qwen2.5:1.5b-instruct",
    displayName: "Qwen 2.5 (Local)",
    contextWindow: 32_768,
    enabled: true,
  },
  {
    modelId: "groq:compound-mini",
    provider: "groq",
    model: "groq/compound-mini",
    displayName: "Compound Mini (Groq)",
    contextWindow: 131_072,
    enabled: true,
  },
  {
    // gemini-1.5-flash is retired on current API keys (404). Use 2.0 Flash.
    modelId: "gemini:2.0-flash",
    provider: "gemini",
    model: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash",
    contextWindow: 1_000_000,
    enabled: true,
  },
  {
    modelId: "groq:gpt-oss-120b",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    displayName: "GPT OSS 120B (Groq)",
    contextWindow: 131_072,
    enabled: true,
  },
  {
    modelId: "groq:qwen3.6-27b",
    provider: "groq",
    model: "qwen/qwen3.6-27b",
    displayName: "Qwen 3.6 27B (Groq)",
    contextWindow: 131_072,
    enabled: true,
  },
  {
    modelId: "openrouter:qwen-2.5-7b",
    provider: "openrouter",
    model: "qwen/qwen-2.5-7b-instruct",
    displayName: "Qwen 2.5 7B (OpenRouter)",
    contextWindow: 32_768,
    enabled: true,
  },
];

export function listEnabledModels(): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => m.enabled);
}
