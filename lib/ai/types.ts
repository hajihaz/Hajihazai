/** Shared contracts for the AI infrastructure layer. */

export type ProviderName = "ollama" | "gemini" | "openrouter" | "groq";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** True when the counts are estimated (provider did not report usage). */
  approx?: boolean;
}

export interface GenerateResult {
  text: string;
  modelId: string;
  provider: ProviderName;
  /** The model the caller asked for (before any fallback). */
  requestedModelId?: string | null;
  /** Set when a different model served the request than was requested. */
  fallbackFrom?: string | null;
  /** Number of providers attempted before one succeeded (1 = no fallback). */
  attempts?: number;
  latencyMs?: number;
  usage?: TokenUsage;
}

export interface GenerateOptions {
  /** Caller cancellation; generation must stop before trying another model. */
  signal?: AbortSignal;
  /** When set, ask the provider to enforce structured JSON output. */
  jsonSchema?: Record<string, unknown>;
}

/** Provider-agnostic native tool definition (parameters = JSON schema). */
export interface NativeToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A native tool call returned by the model (arguments already parsed). */
export interface NativeToolCall {
  name: string;
  arguments: unknown;
}

export interface GenerateWithToolsResult {
  text: string;
  toolCalls: NativeToolCall[];
}

export interface Provider {
  name: ProviderName;
  /** Whether this provider is usable in the current environment. */
  isAvailable(): boolean;
  /** Run a single non-streaming completion. Throws on transport/API error. */
  generate(
    model: string,
    messages: ChatMessage[],
    opts?: GenerateOptions,
  ): Promise<string>;
  /** Token-by-token streaming completion. Yields text chunks. Optional. */
  generateStream?(
    model: string,
    messages: ChatMessage[],
  ): AsyncGenerator<string>;
  /** Native function calling (optional capability). Throws on transport error. */
  generateWithTools?(
    model: string,
    messages: ChatMessage[],
    tools: NativeToolDefinition[],
  ): Promise<GenerateWithToolsResult>;
}
