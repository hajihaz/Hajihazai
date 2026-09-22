import { describe, it, expect } from "vitest";
import {
  validateToolInput,
  withTimeout,
  executeDetectedToolCall,
  selectAndRunTool,
} from "@/lib/tools/tool-calling";
import { getTool } from "@/lib/tools/registry";
import type { NativeToolCall } from "@/lib/ai/types";

const select =
  (calls: NativeToolCall[]) => async () => ({ toolCalls: calls });

describe("validateToolInput (zod)", () => {
  it("accepts valid input", () => {
    expect(validateToolInput(getTool("calculator")!, { expression: "1+1" }).ok).toBe(true);
  });
  it("rejects missing required field", () => {
    expect(validateToolInput(getTool("calculator")!, {}).ok).toBe(false);
  });
  it("rejects wrong type", () => {
    expect(validateToolInput(getTool("memory_search")!, { query: 5 }).ok).toBe(false);
  });
  it("accepts empty input for tools with no required fields", () => {
    expect(validateToolInput(getTool("current_time")!, {}).ok).toBe(true);
  });
});

describe("withTimeout", () => {
  it("resolves a fast promise", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });
  it("rejects when the promise exceeds the timeout", async () => {
    const never = new Promise((r) => setTimeout(r, 5000));
    await expect(withTimeout(never, 30)).rejects.toThrow(/timed out/i);
  });
});

describe("executeDetectedToolCall (standardized result)", () => {
  it("executes calculator and returns {success, tool, result, durationMs}", async () => {
    const r = await executeDetectedToolCall("u1", {
      tool: "calculator",
      input: { expression: "475000 * 0.22" },
    });
    expect(r.success).toBe(true);
    expect(r.tool).toBe("calculator");
    expect(r.result).toEqual({ result: 104500 });
    expect(typeof r.durationMs).toBe("number");
    expect(r.status).toBe("success");
  });

  it("executes current_time", async () => {
    const r = await executeDetectedToolCall("u1", { tool: "current_time", input: {} });
    expect(r.success).toBe(true);
    expect(typeof (r.result as any).iso).toBe("string");
  });

  it("rejects an unknown tool", async () => {
    const r = await executeDetectedToolCall("u1", { tool: "rm_rf", input: {} });
    expect(r.success).toBe(false);
    expect(r.status).toBe("rejected");
    expect(r.error).toMatch(/unknown tool/i);
  });

  it("rejects invalid input", async () => {
    const r = await executeDetectedToolCall("u1", { tool: "calculator", input: {} });
    expect(r.success).toBe(false);
    expect(r.status).toBe("rejected");
  });

  it("rejects memory_search with no query (before any DB call)", async () => {
    const r = await executeDetectedToolCall("u1", { tool: "memory_search", input: {} });
    expect(r.success).toBe(false);
    expect(r.status).toBe("rejected");
  });

  it("rejects knowledge_search with no query (before any DB call)", async () => {
    const r = await executeDetectedToolCall("u1", { tool: "knowledge_search", input: {} });
    expect(r.success).toBe(false);
    expect(r.status).toBe("rejected");
  });
});

describe("selectAndRunTool (native selection, single execution)", () => {
  it("runs no tool when the model returns no tool calls", async () => {
    const r = await selectAndRunTool("u1", "hello", { selectTools: select([]) });
    expect(r.toolRequested).toBeNull();
    expect(r.toolExecuted).toBe(false);
    expect(r.run).toBeNull();
  });

  it("deterministically executes calculator for explicit arithmetic", async () => {
    const r = await selectAndRunTool(
      "u1",
      "What is 22 * 475000? Use the calculator tool and answer with the exact number only.",
    );
    expect(r.toolRequested?.tool).toBe("calculator");
    expect(r.toolExecuted).toBe(true);
    expect(r.toolResult).toEqual({ result: 10_450_000 });
  });

  it("executes the tool the model selected", async () => {
    const r = await selectAndRunTool("u1", "compute it", {
      selectTools: select([
        { name: "calculator", arguments: { expression: "475000 * 0.22" } },
      ]),
    });
    expect(r.toolRequested?.tool).toBe("calculator");
    expect(r.toolExecuted).toBe(true);
    expect(r.toolResult).toEqual({ result: 104500 });
    expect(r.run?.success).toBe(true);
  });

  it("executes ONLY the first tool when several are returned", async () => {
    const r = await selectAndRunTool("u1", "do stuff", {
      selectTools: select([
        { name: "calculator", arguments: { expression: "2 + 2" } },
        { name: "current_time", arguments: {} },
      ]),
    });
    expect(r.toolRequested?.tool).toBe("calculator");
    expect(r.toolResult).toEqual({ result: 4 });
  });

  it("rejects a hallucinated tool name", async () => {
    const r = await selectAndRunTool("u1", "hack", {
      selectTools: select([{ name: "shell", arguments: { cmd: "ls" } }]),
    });
    expect(r.toolRequested?.tool).toBe("shell");
    expect(r.toolExecuted).toBe(false);
    expect(r.run?.status).toBe("rejected");
  });

  it("handles a provider returning undefined toolCalls defensively", async () => {
    const r = await selectAndRunTool("u1", "hi", {
      // @ts-expect-error simulate a provider that returns no toolCalls field
      selectTools: async () => ({}),
    });
    expect(r.toolRequested).toBeNull();
    expect(r.toolExecuted).toBe(false);
  });
});
