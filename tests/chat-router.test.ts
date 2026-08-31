import { describe, it, expect } from "vitest";
import { planRoute } from "@/lib/ai/router";
import { providers } from "@/lib/ai/providers";
import type { ProviderName } from "@/lib/ai/types";

const ALL: Record<ProviderName, boolean> = {
  ollama: true,
  gemini: true,
  openrouter: true,
  groq: true,
};

describe("chat routing order: Groq → OpenRouter → Gemini → Ollama", () => {
  it("prefers Groq when everything is available", () => {
    const chain = planRoute({ isProd: true, available: ALL });
    expect(chain[0]?.provider).toBe("groq");
  });

  it("prefers the reasoning-focused QwQ model within Groq", () => {
    const chain = planRoute({ isProd: true, available: ALL });
    expect(chain[0]?.modelId).toBe("groq:qwen-qwq-32b");
  });

  it("falls to Groq when OpenRouter is unavailable", () => {
    const chain = planRoute({
      isProd: true,
      available: { ...ALL, openrouter: false },
    });
    expect(chain[0]?.provider).toBe("groq");
  });

  it("falls to Gemini when OpenRouter + Groq are unavailable", () => {
    const chain = planRoute({
      isProd: true,
      available: { ...ALL, openrouter: false, groq: false },
    });
    expect(chain[0]?.provider).toBe("gemini");
  });

  it("falls to Ollama when only Ollama is available (local dev)", () => {
    const chain = planRoute({
      isProd: false,
      available: { ollama: true, gemini: false, openrouter: false, groq: false },
    });
    expect(chain[0]?.provider).toBe("ollama");
  });

  it("orders the full fallback chain correctly", () => {
    const chain = planRoute({ isProd: true, available: ALL });
    const order = chain.map((e) => e.provider);
    // first occurrence of each provider in chain order
    expect(order.indexOf("groq")).toBeLessThan(order.indexOf("openrouter"));
    expect(order.indexOf("groq")).toBeLessThan(order.indexOf("gemini"));
    expect(order.indexOf("gemini")).toBeLessThan(order.indexOf("ollama"));
  });

  it("honors a preferred Groq model first", () => {
    const chain = planRoute({
      preferredModelId: "groq:llama-3.3-70b",
      isProd: true,
      available: ALL,
    });
    expect(chain[0]?.modelId).toBe("groq:llama-3.3-70b");
  });

  it("returns an empty chain when no provider is available", () => {
    const chain = planRoute({
      isProd: true,
      available: { ollama: false, gemini: false, openrouter: false, groq: false },
    });
    expect(chain.length).toBe(0);
  });
});

describe("Groq provider availability", () => {
  it("reflects GROQ_API_KEY presence", () => {
    const orig = process.env.GROQ_API_KEY;
    try {
      delete process.env.GROQ_API_KEY;
      expect(providers.groq.isAvailable()).toBe(false);
      process.env.GROQ_API_KEY = "test-key";
      expect(providers.groq.isAvailable()).toBe(true);
    } finally {
      if (orig) process.env.GROQ_API_KEY = orig;
      else delete process.env.GROQ_API_KEY;
    }
  });

  it("supports native tool calling", () => {
    expect(typeof providers.groq.generateWithTools).toBe("function");
  });
});
