import { describe, it, expect, vi, beforeEach } from "vitest";

// Control whether the (mocked) Gemini provider fails, simulating a 429.
const ctrl = vi.hoisted(() => ({ geminiFails: true }));

// Mock the providers so we can deterministically drive success/failure without
// real network calls. Gemini + OpenRouter available; Groq + Ollama not.
vi.mock("@/lib/ai/providers", () => ({
  providers: {
    ollama: { name: "ollama", isAvailable: () => false, generate: async () => "ollama" },
    gemini: {
      name: "gemini",
      isAvailable: () => true,
      generate: async () => {
        if (ctrl.geminiFails) throw new Error("Gemini error 429");
        return "gemini answer";
      },
    },
    openrouter: {
      name: "openrouter",
      isAvailable: () => true,
      generate: async () => "openrouter answer",
    },
    groq: { name: "groq", isAvailable: () => false, generate: async () => "groq" },
  },
}));

import { routeChat, planRoute } from "@/lib/ai/router";
import type { ProviderName } from "@/lib/ai/types";
import { recordSuccess } from "@/lib/ai/health";

const AVAIL: Record<ProviderName, boolean> = {
  ollama: false,
  gemini: true,
  openrouter: true,
  groq: false,
};

beforeEach(() => {
  // The health store is intentionally process-local in production. Reset the
  // test's selected Gemini model so a preceding fallback test cannot poison the
  // next test (or another suite running in the same Vitest worker).
  recordSuccess("gemini:2.0-flash");
  ctrl.geminiFails = false;
});

describe("selected model is honored (attempted first)", () => {
  it("puts the selected model at the front of the chain", () => {
    const chain = planRoute({
      preferredModelId: "gemini:2.0-flash",
      isProd: true,
      available: AVAIL,
    });
    expect(chain[0]?.modelId).toBe("gemini:2.0-flash");
  });

  it("serves the selected model when it succeeds (no fallback)", async () => {
    ctrl.geminiFails = false;
    const r = await routeChat([{ role: "user", content: "hi" }], {
      preferredModelId: "gemini:2.0-flash",
    });
    expect(r.provider).toBe("gemini");
    expect(r.modelId).toBe("gemini:2.0-flash");
  });
});

describe("fallback only after the selected provider fails", () => {
  it("falls back to the next provider when the selected one throws", async () => {
    ctrl.geminiFails = true;
    const r = await routeChat([{ role: "user", content: "hi" }], {
      preferredModelId: "gemini:2.0-flash",
    });
    // Gemini was tried first and failed → fell back.
    expect(r.provider).toBe("openrouter");
    // Footer relies on this: the returned modelId is the ACTUAL serving model.
    expect(r.modelId).toBe("openrouter:qwen-2.5-7b");
    expect(r.modelId).not.toBe("gemini:2.0-flash");
  });

  it("does not fall back when the selected provider succeeds", async () => {
    ctrl.geminiFails = false;
    const r = await routeChat([{ role: "user", content: "hi" }], {
      preferredModelId: "gemini:2.0-flash",
    });
    expect(r.provider).toBe("gemini");
  });
});
