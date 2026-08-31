import { describe, it, expect, afterEach, vi } from "vitest";
import {
  recordFailure,
  recordSuccess,
  getHealth,
  isKnownUnhealthy,
  isModelUsable,
} from "@/lib/ai/health";

afterEach(() => {
  vi.useRealTimers();
});

describe("model health store", () => {
  it("records a failure and reports the model unhealthy", () => {
    recordFailure("groq:deepseek-r1-70b", "model_decommissioned");
    expect(isKnownUnhealthy("groq:deepseek-r1-70b")).toBe(true);
  });

  it("records success and clears the unhealthy flag", () => {
    recordFailure("groq:gpt-oss-120b", "x");
    recordSuccess("groq:gpt-oss-120b", 12);
    expect(isKnownUnhealthy("groq:gpt-oss-120b")).toBe(false);
    expect(getHealth("groq:gpt-oss-120b")?.healthy).toBe(true);
    expect(getHealth("groq:gpt-oss-120b")?.latencyMs).toBe(12);
  });

  it("isModelUsable is false when a model with a valid key is known-unhealthy", () => {
    const prev = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "test-key";
    try {
      recordSuccess("groq:qwen3.6-27b");
      expect(isModelUsable("groq:qwen3.6-27b")).toBe(true);
      recordFailure("groq:qwen3.6-27b", "boom");
      expect(isModelUsable("groq:qwen3.6-27b")).toBe(false);
    } finally {
      if (prev) process.env.GROQ_API_KEY = prev;
      else delete process.env.GROQ_API_KEY;
    }
  });

  it("expires health results after the TTL", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));
    recordFailure("ollama:qwen2.5", "x");
    expect(isKnownUnhealthy("ollama:qwen2.5")).toBe(true);
    // Advance past the 5-minute TTL.
    vi.setSystemTime(new Date("2025-01-01T00:06:00Z"));
    expect(getHealth("ollama:qwen2.5")).toBeUndefined();
  });
});
