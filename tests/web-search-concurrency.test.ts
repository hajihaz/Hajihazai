import { describe, expect, it, vi, afterEach } from "vitest";
import { webSearchMany, resetWebSearchStateForTests } from "@/lib/web/search";

afterEach(() => {
  vi.restoreAllMocks();
  resetWebSearchStateForTests();
});

describe("webSearchMany concurrency", () => {
  it("bounds live fan-out to the configured concurrency", async () => {
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.GROQ_API_KEY;
    let active = 0;
    let peak = 0;
    try {
      process.env.GROQ_API_KEY = "test-key";
      globalThis.fetch = (async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active--;
        return new Response(JSON.stringify({
          choices: [{ message: { executed_tools: [{
            type: "browser_search",
            search_results: { results: [{ title: "Source", url: `https://tn.gov.in/${active}`, content: "Official government evidence with enough readable text for verification." }] },
          }] } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch;
      const result = await webSearchMany(["a current fact", "b current fact", "c current fact"], 5, 2);
      expect(result.results.length).toBeGreaterThan(0);
      expect(peak).toBeLessThanOrEqual(2);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = originalKey;
    }
  });
});
