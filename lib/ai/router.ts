import type {
  ChatMessage,
  GenerateResult,
  GenerateWithToolsResult,
  NativeToolDefinition,
  ProviderName,
} from "./types";
import { listEnabledModels, type ModelEntry } from "./registry";
import { providers } from "./providers";
import { recordFailure, recordSuccess } from "./health";

function estimateUsage(messages: ChatMessage[], text: string) {
  // Providers here don't report token usage; approximate at ~4 chars/token.
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  return {
    promptTokens: Math.round(promptChars / 4),
    completionTokens: Math.round(text.length / 4),
    totalTokens: Math.round((promptChars + text.length) / 4),
    approx: true as const,
  };
}

/**
 * Pure routing policy (no network) — easy to unit test.
 *
 * Rules:
 *   - Local development  → Ollama first
 *   - Production         → Gemini first
 *   - Fallback           → OpenRouter
 * A user-selected model (preferredModelId) is tried first when available;
 * the rest of the environment chain follows as fallbacks.
 */
export function planRoute(opts: {
  preferredModelId?: string;
  isProd: boolean;
  available: Record<ProviderName, boolean>;
}): ModelEntry[] {
  const enabled = listEnabledModels();
  // Routing order: OpenRouter → Groq → Gemini → Ollama. Unavailable providers
  // (no key / not reachable) are skipped, so local dev with only Ollama still
  // resolves to Ollama. `isProd` is accepted for signature stability.
  void opts.isProd;
  const order: ProviderName[] = ["groq", "openrouter", "gemini", "ollama"];

  const chain: ModelEntry[] = [];
  const pushFirstFor = (p: ProviderName) => {
    const preferredGroq =
      p === "groq"
        ? enabled.find((e) => e.modelId === "groq:qwen-qwq-32b" && opts.available[p])
        : undefined;
    const entry = preferredGroq ?? enabled.find((e) => e.provider === p && opts.available[p]);
    if (entry && !chain.includes(entry)) chain.push(entry);
  };

  // Preferred model first (if enabled and its provider is available).
  if (opts.preferredModelId) {
    const pref = enabled.find(
      (e) => e.modelId === opts.preferredModelId && opts.available[e.provider],
    );
    if (pref) chain.push(pref);
  }

  for (const p of order) pushFirstFor(p);
  return chain;
}

/** Execute the routed chain, falling back until a provider returns text. */
export async function routeChat(
  messages: ChatMessage[],
  opts: { preferredModelId?: string; jsonSchema?: Record<string, unknown> } = {},
): Promise<GenerateResult> {
  const available: Record<ProviderName, boolean> = {
    ollama: providers.ollama.isAvailable(),
    gemini: providers.gemini.isAvailable(),
    openrouter: providers.openrouter.isAvailable(),
    groq: providers.groq.isAvailable(),
  };

  const chain = planRoute({
    preferredModelId: opts.preferredModelId,
    isProd: process.env.NODE_ENV === "production",
    available,
  });

  const requestedModelId = chain[0]?.modelId ?? opts.preferredModelId ?? null;
  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    const entry = chain[i];
    console.log(`[ai] selected provider=${entry.provider} model=${entry.modelId}`);
    const start = Date.now();
    try {
      const text = await providers[entry.provider].generate(entry.model, messages, {
        jsonSchema: opts.jsonSchema,
      });
      if (text && text.trim()) {
        const latencyMs = Date.now() - start;
        recordSuccess(entry.modelId, latencyMs);
        if (i > 0) {
          console.warn(`[ai] fallback used: ${entry.provider} (after ${i} failure(s))`);
        }
        return {
          text,
          modelId: entry.modelId,
          provider: entry.provider,
          requestedModelId,
          fallbackFrom:
            i > 0 && requestedModelId && requestedModelId !== entry.modelId
              ? requestedModelId
              : null,
          attempts: i + 1,
          latencyMs,
          usage: estimateUsage(messages, text),
        };
      }
      recordFailure(entry.modelId, "empty response");
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ai] provider=${entry.provider} failed: ${reason}`);
      recordFailure(entry.modelId, reason);
      lastError = error;
    }
  }

  console.error("[ai] all chat providers failed:", lastError);
  return {
    text: "⚠️ HajiHaz could not reach any AI provider right now. Please try again.",
    modelId: "none",
    provider: "ollama",
    requestedModelId,
    attempts: chain.length,
  };
}

export interface StreamChatResult {
  stream: AsyncIterable<string>;
  modelId: string;
  provider: ProviderName;
  requestedModelId: string | null;
}

/**
 * Like routeChat but streams tokens as they arrive. Falls back to routeChat
 * (full response as one chunk) when no provider supports generateStream.
 */
export async function routeChatStream(
  messages: ChatMessage[],
  opts: { preferredModelId?: string } = {},
): Promise<StreamChatResult> {
  const available: Record<ProviderName, boolean> = {
    ollama: providers.ollama.isAvailable(),
    gemini: providers.gemini.isAvailable(),
    openrouter: providers.openrouter.isAvailable(),
    groq: providers.groq.isAvailable(),
  };

  const chain = planRoute({
    preferredModelId: opts.preferredModelId,
    isProd: process.env.NODE_ENV === "production",
    available,
  });

  const requestedModelId = chain[0]?.modelId ?? opts.preferredModelId ?? null;

  for (const entry of chain) {
    const provider = providers[entry.provider];
    if (typeof provider.generateStream !== "function") continue;
    return {
      stream: provider.generateStream(entry.model, messages),
      modelId: entry.model,
      provider: entry.provider,
      requestedModelId,
    };
  }

  // No streaming provider available: fall back to full non-streaming, yield once.
  const result = await routeChat(messages, opts);
  return {
    stream: (async function* () { yield result.text; })(),
    modelId: result.modelId,
    provider: result.provider,
    requestedModelId,
  };
}

/**
 * Native function calling across the routed chain. Uses the first available
 * provider that supports tools. Returns empty toolCalls if none can.
 */
export async function routeChatWithTools(
  messages: ChatMessage[],
  tools: NativeToolDefinition[],
  opts: { preferredModelId?: string } = {},
): Promise<GenerateWithToolsResult & { modelId: string; provider: ProviderName }> {
  const available: Record<ProviderName, boolean> = {
    ollama: providers.ollama.isAvailable(),
    gemini: providers.gemini.isAvailable(),
    openrouter: providers.openrouter.isAvailable(),
    groq: providers.groq.isAvailable(),
  };

  const chain = planRoute({
    preferredModelId: opts.preferredModelId,
    isProd: process.env.NODE_ENV === "production",
    available,
  });

  let lastError: unknown;
  let attempt = 0;
  for (const entry of chain) {
    const provider = providers[entry.provider];
    if (typeof provider.generateWithTools !== "function") continue;
    console.log(`[ai] tool-select provider=${entry.provider} model=${entry.modelId}`);
    try {
      const result = await provider.generateWithTools(entry.model, messages, tools);
      if (attempt > 0) {
        console.warn(`[ai] tool-select fallback used: ${entry.provider}`);
      }
      return { ...result, modelId: entry.modelId, provider: entry.provider };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ai] tool-select provider=${entry.provider} failed: ${reason}`);
      lastError = error;
    }
    attempt++;
  }

  if (lastError) console.error("[ai] all tool-capable providers failed:", lastError);
  return { text: "", toolCalls: [], modelId: "none", provider: "ollama" };
}
