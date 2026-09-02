import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { geminiProvider } from "../lib/ai/providers/gemini";
import { geminiEmbeddingProvider } from "../lib/ai/embeddings/providers/gemini";

describe("Gemini providers", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "gemini-secret-test";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  });

  it("sends the chat API key in a header, never the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "answer" }] } }],
    }), { status: 200 }));
    globalThis.fetch = fetchMock;
    await geminiProvider.generate("gemini-2.5-flash", [{ role: "user", content: "hello" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("gemini-secret-test");
    expect(url).not.toContain("?key=");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("gemini-secret-test");
  });

  it("sends tool-call API keys in a header, never the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "answer" }] } }],
    }), { status: 200 }));
    globalThis.fetch = fetchMock;
    await geminiProvider.generateWithTools!("gemini-2.5-flash", [{ role: "user", content: "hello" }], []);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).not.toContain("gemini-secret-test");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("gemini-secret-test");
  });

  it("sends embedding API keys in a header, never the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      embedding: { values: [0.1, 0.2] },
    }), { status: 200 }));
    globalThis.fetch = fetchMock;
    const result = await geminiEmbeddingProvider.embed("gemini-embedding-001", "hello");
    const [url, init] = fetchMock.mock.calls[0];
    expect(result).toEqual([0.1, 0.2]);
    expect(url).not.toContain("gemini-secret-test");
    expect(url).not.toContain("?key=");
    expect(new Headers(init.headers).get("x-goog-api-key")).toBe("gemini-secret-test");
  });
});
