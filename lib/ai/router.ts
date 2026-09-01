import type {
  ChatMessage,
  GenerateResult,
  GenerateWithToolsResult,
  NativeToolDefinition,
  ProviderName,
} from "./types";
import { listEnabledModels, type ModelEntry } from "./registry";
import { providers } from "./providers";
import { isKnownUnhealthy, recordFailure, recordSuccess } from "./health";

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
 *   - Groq → OpenRouter → Gemini → Ollama
 *   - GPT-OSS 120B is the preferred Groq model
 *   - A user-selected model is tried first when available; the environment
 *     chain then supplies resilient fallbacks.
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
  const usable = (entry: ModelEntry) =>
    opts.available[entry.provider] && !isKnownUnhealthy(entry.modelId);

  const pushAllFor = (p: ProviderName) => {
    const entries = enabled.filter((e) => e.provider === p && usable(e));
    // Keep the strongest legacy Groq model ahead of the other legacy Groq
    // models, but leave Compound Mini first when it is the selected level.
    if (p === "groq") {
      entries.sort((a, b) => {
        const rank = (id: string) =>
          id === "groq:compound-mini" ? 0 : id === "groq:gpt-oss-120b" ? 1 : 2;
        return rank(a.modelId) - rank(b.modelId);
      });
    }
    for (const entry of entries) {
      if (!chain.includes(entry)) chain.push(entry);
    }
  };

  // Preferred model first (if enabled and its provider is available).
  if (opts.preferredModelId) {
    const pref = enabled.find(
      (e) => e.modelId === opts.preferredModelId && usable(e),
    );
    if (pref) chain.push(pref);
  }

  for (const p of order) pushAllFor(p);
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

  const requestedModelId = opts.preferredModelId ?? chain[0]?.modelId ?? null;
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

const STREAM_IDLE_TIMEOUT_MS = 15_000;

function nextWithTimeout<T>(
  iterator: AsyncIterator<T>,
  timeoutMs: number,
): Promise<IteratorResult<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    iterator.next(),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`provider stream timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export interface StreamChatResult {
  stream: AsyncIterable<string>;
  /** Actual serving model/provider; populated once the stream selects a provider. */
  modelId: string;
  provider: ProviderName;
  requestedModelId: string | null;
  fallbackFrom: string | null;
  attempts: number;
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

  const requestedModelId = opts.preferredModelId ?? chain[0]?.modelId ?? null;

  // Providers are lazy async generators: the network request happens when the
  // generator is consumed, not when generateStream() is called. Keep fallback
  // logic inside the returned generator so an unavailable primary provider can
  // be skipped automatically before any text reaches the client.
  const streamWithFallback = async function* (): AsyncIterable<string> {
    let lastError: unknown;
    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];
      const provider = providers[entry.provider];
      result.modelId = entry.modelId;
      result.provider = entry.provider;
      result.attempts = i + 1;
      result.fallbackFrom =
        i > 0 && requestedModelId && requestedModelId !== entry.modelId
          ? requestedModelId
          : null;
      console.log(`[ai] stream-select provider=${entry.provider} model=${entry.modelId}`);
      const started = Date.now();
      let emitted = false;
      try {
        // Prefer true streaming, but never make a non-streaming provider a dead
        // end in the fallback chain. Gemini, for example, exposes generate() but
        // not generateStream(); it must still be able to rescue a failed Groq /
        // OpenRouter request in production.
        if (typeof provider.generateStream === "function") {
          const iter = provider.generateStream(entry.model, messages)[Symbol.asyncIterator]();
          while (true) {
            const next = await nextWithTimeout(iter, STREAM_IDLE_TIMEOUT_MS);
            if (next.done) break;
            if (next.value) {
              emitted = true;
              yield next.value;
            }
          }
        } else {
          const text = await provider.generate(entry.model, messages);
          if (text && text.trim()) {
            emitted = true;
            yield text;
          } else {
            throw new Error("provider returned an empty response");
          }
        }
        // A streaming provider can legally close with HTTP 200 but emit no
        // usable content. Treat that as a provider failure, not success: the
        // old behavior returned a clean empty stream, which made the browser
        // show "No response received" instead of activating the fallback chain.
        if (!emitted) {
          throw new Error("provider returned an empty streamed response");
        }
        recordSuccess(entry.modelId, Date.now() - started);
        return;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordFailure(entry.modelId, reason);
        lastError = error;
        console.warn(`[ai] stream provider=${entry.provider} failed: ${reason}`);
        // Never concatenate two partially generated answers. If the provider
        // failed before emitting text, safely continue to the next provider.
        if (emitted) throw error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("No AI provider could stream a response");
  };

  const result: StreamChatResult = {
    stream: streamWithFallback(),
    modelId: "none",
    provider: "ollama",
    requestedModelId,
    fallbackFrom: null,
    attempts: 0,
  };
  return result;
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
