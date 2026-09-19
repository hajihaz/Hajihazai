import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("tools (db + router)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let docs: any;
  let chunkQ: any;
  let embedChunks: any;
  let memEmbed: any;
  let router: any;
  let ToolErrorCtor: any;
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
    router = await import("@/lib/tools/router");
    ({ ToolError: ToolErrorCtor } = await import("@/lib/tools/types"));

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
    A = await mk(`tool-A-${s}@example.com`);
    B = await mk(`tool-B-${s}@example.com`);

    await db.insert(schema.userMemory).values({
      userId: A,
      type: "fact",
      content: "The user owns a company called Acme Corporation.",
      status: "active",
      validFrom: new Date(),
      updatedAt: new Date(),
    });
    await memEmbed.embedAllMemories(A);

    const doc = await docs.createDocument(A, { title: "Acme Overview", status: "active" });
    await chunkQ.createChunks(A, doc.id, [
      {
        chunkIndex: 0,
        content:
          "Acme Corporation was founded in 2020 and sells cloud software to startups.",
      },
    ]);
    await embedChunks.embedDocumentChunks(A, doc.id);
  });

  afterAll(async () => {
    if (!db || !schema || !A) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
  });

  it("calculator via executeTool", async () => {
    expect(await router.executeTool(A, "calculator", { expression: "(2+3)*4" })).toEqual(
      { result: 20 },
    );
  });

  it("current_time via executeTool", async () => {
    const r: any = await router.executeTool(A, "current_time", {});
    expect(typeof r.iso).toBe("string");
    expect(typeof r.timezone).toBe("string");
  });

  it("router: unknown tool throws ToolError(unknown_tool)", async () => {
    await expect(router.executeTool(A, "nope", {})).rejects.toMatchObject({
      code: "unknown_tool",
    });
  });

  it("router: invalid input throws ToolError(invalid_input)", async () => {
    await expect(router.executeTool(A, "memory_search", {})).rejects.toMatchObject(
      { code: "invalid_input" },
    );
  });

  it("memory_search returns memories and respects ownership", async () => {
    if (!ready) return;
    const a: any = await router.executeTool(A, "memory_search", {
      query: "what company does the user own",
    });
    expect(Array.isArray(a.memories)).toBe(true);
    expect(a.memories.length).toBeGreaterThan(0);

    const b: any = await router.executeTool(B, "memory_search", {
      query: "what company does the user own",
    });
    expect(b.memories.length).toBe(0); // isolation: B has no memories
  });

  it("knowledge_search returns chunks and respects ownership", async () => {
    if (!ready) return;
    const a: any = await router.executeTool(A, "knowledge_search", {
      query: "when was Acme founded and what does it sell",
    });
    expect(Array.isArray(a.chunks)).toBe(true);
    expect(a.chunks.length).toBeGreaterThan(0);

    const b: any = await router.executeTool(B, "knowledge_search", {
      query: "when was Acme founded and what does it sell",
    });
    expect(b.chunks.length).toBe(0); // isolation: B owns no documents
  });
});
