import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("single tool calling — memory/knowledge (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let docs: any;
  let chunkQ: any;
  let embedChunks: any;
  let memEmbed: any;
  let tc: any;
  let A = "";
  let B = "";
  let ready = false;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    docs = await import("@/lib/db/knowledge-queries");
    chunkQ = await import("@/lib/db/knowledge-chunk-queries");
    embedChunks = await import("@/lib/knowledge/embed-chunks");
    memEmbed = await import("@/lib/memory/embed-memory");
    tc = await import("@/lib/tools/tool-calling");

    try {
      const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api";
      const res = await fetch(`${base}/tags`);
      const data = await res.json();
      ready =
        res.ok &&
        Array.isArray(data?.models) &&
        data.models.some((m: { name: string }) =>
          m.name.includes("nomic-embed-text"),
        );
    } catch {
      ready = false;
    }
    if (!ready) return;

    const s = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const mk = async (email: string) =>
      (await db.insert(schema.users).values({ email }).returning())[0].id;
    A = await mk(`tc-A-${s}@example.com`);
    B = await mk(`tc-B-${s}@example.com`);

    await db.insert(schema.userMemory).values({
      userId: A,
      type: "fact",
      content: "The user owns a company called Acme Corporation.",
      status: "active",
      validFrom: new Date(),
      updatedAt: new Date(),
    });
    await memEmbed.embedAllMemories(A);

    const doc = await docs.createDocument(A, { title: "Acme", status: "active" });
    await chunkQ.createChunks(A, doc.id, [
      { chunkIndex: 0, content: "Acme Corporation was founded in 2020 and sells cloud software." },
    ]);
    await embedChunks.embedDocumentChunks(A, doc.id);
  });

  afterAll(async () => {
    if (!db || !schema || !A) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
  });

  it("memory tool call returns memories (owner) and respects isolation", async () => {
    if (!ready) return;
    const selectTools = async () => ({
      toolCalls: [
        { name: "memory_search", arguments: { query: "what company does the user own" } },
      ],
    });

    const a = await tc.selectAndRunTool(A, "what company do I own", { selectTools });
    expect(a.toolExecuted).toBe(true);
    expect((a.toolResult as any).memories.length).toBeGreaterThan(0);

    const b = await tc.selectAndRunTool(B, "what company do I own", { selectTools });
    expect(b.toolExecuted).toBe(true);
    expect((b.toolResult as any).memories.length).toBe(0); // isolation
  });

  it("knowledge tool call returns chunks (owner) and respects isolation", async () => {
    if (!ready) return;
    const selectTools = async () => ({
      toolCalls: [
        { name: "knowledge_search", arguments: { query: "when was Acme founded" } },
      ],
    });

    const a = await tc.selectAndRunTool(A, "when was Acme founded", { selectTools });
    expect(a.toolExecuted).toBe(true);
    expect((a.toolResult as any).chunks.length).toBeGreaterThan(0);

    const b = await tc.selectAndRunTool(B, "when was Acme founded", { selectTools });
    expect(b.toolExecuted).toBe(true);
    expect((b.toolResult as any).chunks.length).toBe(0); // isolation
  });
});
