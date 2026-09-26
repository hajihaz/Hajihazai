import { routeChatWithTools } from "@/lib/ai/router";
import type { NativeToolCall, NativeToolDefinition } from "@/lib/ai/types";
import { executeTool, getTool } from "./router";
import { toToolDefinitions } from "./specs";
import { recordToolInvocation } from "@/lib/db/tool-queries";
import type { Tool } from "./types";

/**
 * Phase 8.4 — Native single tool calling.
 * The model selects a tool via the provider's NATIVE function-calling API
 * (no text protocol, no regex, no JSON extraction, no NO_TOOL sentinel).
 * We execute exactly ONE tool (the first returned), with validation, timeout,
 * and best-effort audit. No loops / recursion / multi-tool orchestration.
 */

export const TOOL_TIMEOUT_MS = 10_000;
export const COMMANDER_TOOL_TIMEOUT_MS = 60_000;
export const DETECTION_TIMEOUT_MS = 5_000;

/**
 * Most deterministic tools should fail fast. Commander is different: it makes a
 * nested Responses API + MCP round-trip and real Mac operations can legitimately
 * take longer than 10 seconds. Callers may still provide an explicit override.
 */
export function resolveToolTimeoutMs(toolName: string, override?: number): number {
  if (typeof override === "number") return override;
  return toolName === "hajihaz_commander" ? COMMANDER_TOOL_TIMEOUT_MS : TOOL_TIMEOUT_MS;
}

export type ToolStatus = "success" | "error" | "timeout" | "rejected";

export interface DetectedToolCall {
  tool: string;
  input: unknown;
}

/** Standardized tool execution result (used everywhere). */
export interface ToolRunResult {
  success: boolean;
  tool: string;
  result: unknown;
  durationMs: number;
  status: ToolStatus;
  error?: string;
}

export interface ToolExecution {
  toolRequested: DetectedToolCall | null;
  toolExecuted: boolean;
  toolResult: unknown | null;
  run: ToolRunResult | null;
  durationMs?: number;
  error?: string;
}

/** Validate input with the tool's Zod schema. Friendly error message. */
export function validateToolInput(
  tool: Tool,
  input: unknown,
): { ok: true; data: unknown } | { ok: false; error: string } {
  const parsed = tool.inputSchema.safeParse(input ?? {});
  if (parsed.success) return { ok: true, data: parsed.data };
  const first = parsed.error.issues[0];
  const path = first?.path?.join(".");
  const message = first?.message ?? "invalid input";
  return { ok: false, error: path ? `${path}: ${message}` : message };
}

/** Race a promise against a timeout. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tool timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** Validate + execute a single tool call (one execution, with timeout). */
export async function executeDetectedToolCall(
  userId: string,
  call: DetectedToolCall,
  timeoutMs?: number,
): Promise<ToolRunResult> {
  const tool = getTool(call.tool);
  if (!tool) {
    return {
      success: false,
      tool: call.tool,
      result: null,
      durationMs: 0,
      status: "rejected",
      error: `unknown tool: ${call.tool}`,
    };
  }

  const valid = validateToolInput(tool, call.input);
  if (!valid.ok) {
    return {
      success: false,
      tool: call.tool,
      result: null,
      durationMs: 0,
      status: "rejected",
      error: valid.error,
    };
  }

  const start = Date.now();
  try {
    const result = await withTimeout(
      executeTool(userId, call.tool, valid.data),
      resolveToolTimeoutMs(call.tool, timeoutMs),
    );
    return {
      success: true,
      tool: call.tool,
      result,
      durationMs: Date.now() - start,
      status: "success",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool execution failed";
    return {
      success: false,
      tool: call.tool,
      result: null,
      durationMs: Date.now() - start,
      status: /timed out/i.test(message) ? "timeout" : "error",
      error: message,
    };
  }
}

type SelectFn = (
  messages: { role: "user"; content: string }[],
  tools: NativeToolDefinition[],
) => Promise<{ toolCalls: NativeToolCall[] }>;

const CALCULATOR_INTENT = /\b(calculate|computed?|compute|what(?:'s| is)\b.*(?:\d.*[+\-*/×x].*\d|\d.*\b(?:plus|minus|times|multiplied|divided by)\b)|how much is\b.*\d.*[+\-*/×x].*\d)\b/i;
const CALCULATOR_EXPRESSION = /[\d().+\-*/×x\s]+/g;

const COMMANDER_INTENT = /\bhajihaz\s+commander\b|\b(?:run|execute|open|create|delete|move|read|write|check|inspect|control)\b.{0,100}\b(?:my|the)\s+mac\b/i;

function extractDeterministicCalculatorExpression(message: string): string | null {
  if (!CALCULATOR_INTENT.test(message)) return null;

  const candidates = message.match(CALCULATOR_EXPRESSION) ?? [];
  let best: string | null = null;
  let bestLength = 0;

  for (const raw of candidates) {
    const normalized = raw.trim().replace(/[×x]/gi, "*");
    if (!normalized || !/[+\-*/]/.test(normalized)) continue;
    const numberCount = normalized.match(/\d+(?:\.\d+)?/g)?.length ?? 0;
    if (numberCount < 2 || normalized.length <= bestLength) continue;
    try {
      // Validate the extracted expression before bypassing model selection.
      const tool = getTool("calculator");
      if (!tool) continue;
      const valid = validateToolInput(tool, { expression: normalized });
      if (!valid.ok) continue;
      // The parser itself is the final authority on whether this is arithmetic.
      // This call is intentionally side-effect free.
      const parsed = (valid.data as { expression: string }).expression;
      if (!parsed) continue;
      best = parsed;
      bestLength = parsed.length;
    } catch {
      // Leave ambiguous expressions to the normal native selector.
    }
  }

  return best;
}

async function finishToolExecution(
  userId: string,
  call: DetectedToolCall,
  opts: { timeoutMs?: number; audit?: boolean },
): Promise<ToolExecution> {
  const run = await executeDetectedToolCall(userId, call, opts.timeoutMs);

  if (opts.audit && run.status !== "rejected") {
    await recordToolInvocation({
      userId,
      toolName: call.tool,
      input: call.input,
      output: run.result,
      status: run.status,
      durationMs: run.durationMs,
      error: run.error,
    });
  }

  return {
    toolRequested: call,
    toolExecuted: run.success,
    toolResult: run.result,
    run,
    durationMs: run.durationMs,
    error: run.error,
  };
}

const NO_TOOL: ToolExecution = {
  toolRequested: null,
  toolExecuted: false,
  toolResult: null,
  run: null,
};

/**
 * Native tool selection + single execution.
 * - The model is given tool definitions and chooses natively (bounded by
 *   `detectTimeoutMs`, default 5s; on timeout we continue with no tool).
 * - Only the FIRST returned tool call is executed (one tool per turn).
 * - When `audit` is true, the execution (success/error/timeout) is recorded.
 * - `opts.selectTools` overrides the model selection (tests).
 */
export async function selectAndRunTool(
  userId: string,
  userMessage: string,
  opts: {
    selectTools?: SelectFn;
    timeoutMs?: number;
    detectTimeoutMs?: number;
    audit?: boolean;
  } = {},
): Promise<ToolExecution> {
  const deterministicExpression = !opts.selectTools
    ? extractDeterministicCalculatorExpression(userMessage)
    : null;
  if (!opts.selectTools && COMMANDER_INTENT.test(userMessage)) {
    // Explicit Commander requests are deterministic: do not leave the decision
    // to a second model, because that can silently decline a real Mac operation.
    console.info("[tool-calling] explicit Commander intent matched");
    const result = await finishToolExecution(
      userId,
      { tool: "hajihaz_commander", input: { instruction: userMessage } },
      opts,
    );
    console.info("[tool-calling] Commander execution finished", {
      status: result.run?.status,
      success: result.toolExecuted,
    });
    return result;
  }
  if (deterministicExpression) {
    // Arithmetic is deterministic: use the local calculator directly instead
    // of asking an LLM whether it should call the calculator. This guarantees
    // exact arithmetic and keeps the tool path auditable.
    return finishToolExecution(
      userId,
      { tool: "calculator", input: { expression: deterministicExpression } },
      opts,
    );
  }

  const tools = toToolDefinitions();
  const select: SelectFn =
    opts.selectTools ??
    (async (messages, defs) => {
      const r = await routeChatWithTools(messages, defs);
      return { toolCalls: r.toolCalls };
    });

  let toolCalls: NativeToolCall[];
  try {
    const out = await withTimeout(
      select([{ role: "user", content: userMessage }], tools),
      opts.detectTimeoutMs ?? DETECTION_TIMEOUT_MS,
    );
    toolCalls = out.toolCalls ?? [];
  } catch {
    return NO_TOOL; // detection timed out / errored → continue normal chat
  }

  const first = toolCalls[0];
  if (!first || typeof first.name !== "string") return NO_TOOL;

  const call: DetectedToolCall = { tool: first.name, input: first.arguments };

  // SINGLE execution — only the first call, no loop.
  return finishToolExecution(userId, call, opts);
}
