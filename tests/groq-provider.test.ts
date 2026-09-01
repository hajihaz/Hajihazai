import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { groqProvider } from "../lib/ai/providers/groq";

describe("Groq provider", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.GROQ_API_KEY;
  });

  it("configures GPT-OSS with reasoning and strips private tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "<think>private</think>\nFinal answer" } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetchMock;
    const text = await groqProvider.generate("openai/gpt-oss-120b", [
      { role: "user", content: "hello" },
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(text).toBe("Final answer");
    expect(body.reasoning_effort).toBe("medium");
    expect(body.include_reasoning).toBe(false);
    expect(body.max_completion_tokens).toBe(4096);
  });

  it("preserves token-boundary whitespace while streaming", async () => {
    const encoder = new TextEncoder();
    const payloads = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: " world" } }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "! How are you?" } }] })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const stream = new ReadableStream({
      start(controller) {
        for (const payload of payloads) controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    globalThis.fetch = fetchMock;
    const chunks: string[] = [];
    for await (const chunk of groqProvider.generateStream("openai/gpt-oss-120b", [
      { role: "user", content: "hello" },
    ])) chunks.push(chunk);
    expect(chunks.join("")).toBe("Hello world! How are you?");
  });

  it("uses stable generation settings for Qwen fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "<think>reasoning</think>\nQwen answer" } }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetchMock;
    globalThis.fetch = fetchMock;
    const text = await groqProvider.generate("qwen/qwen3.6-27b", [
      { role: "user", content: "hello" },
    ]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(text).toBe("Qwen answer");
    expect(body.temperature).toBe(0.4);
    expect(body.max_completion_tokens).toBe(4096);
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.reasoning_format).toBe("hidden");
  });
});
