import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("knowledge chunk storage (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let docs: any;
  let chunkQ: any;
  let chunkFn: any;
  let A = "";
  let B = "";

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    docs = await import("@/lib/db/knowledge-queries");
    chunkQ = await import("@/lib/db/knowledge-chunk-queries");
    chunkFn = await import("@/lib/knowledge/chunk");

    const s = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const mk = async (email: string) =>
      (await db.insert(schema.users).values({ email }).returning())[0].id;
    A = await mk(`ch-A-${s}@example.com`);
    B = await mk(`ch-B-${s}@example.com`);
  });

  afterAll(async () => {
    if (!db || !schema || !A) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
  });

  it("persists chunks in order for the owner", async () => {
    const doc = await docs.createDocument(A, { title: "Chunked doc" });
    const chunks = chunkFn.chunkDocument("a".repeat(2500));
    const saved = await chunkQ.createChunks(A, doc.id, chunks);
    expect(saved.length).toBe(chunks.length);

    const listed = await chunkQ.listChunks(A, doc.id);
    expect(listed.length).toBe(chunks.length);
    listed.forEach((c: any, i: number) => expect(c.chunkIndex).toBe(i));
  });

  it("regenerating replaces prior chunks (no duplicates)", async () => {
    const doc = await docs.createDocument(A, { title: "Regen doc" });
    await chunkQ.createChunks(A, doc.id, chunkFn.chunkDocument("b".repeat(3000)));
    const second = await chunkQ.createChunks(
      A,
      doc.id,
      chunkFn.chunkDocument("c".repeat(1200)),
    );
    const listed = await chunkQ.listChunks(A, doc.id);
    expect(listed.length).toBe(second.length);
  });

  it("rejects a stale content snapshot without replacing the current index", async () => {
    const doc = await docs.createDocument(A, { title: "Stale snapshot" });
    const content = await (await import("@/lib/db/knowledge-content-queries")).createContent(
      A,
      doc.id,
      "current",
    );
    await chunkQ.createChunks(A, doc.id, [{ chunkIndex: 0, content: "current" }], "current");

    await (await import("@/lib/db/knowledge-content-queries")).updateContent(
      A,
      doc.id,
      "newer",
    );

    await expect(
      chunkQ.createChunks(A, doc.id, [{ chunkIndex: 0, content: "stale" }], content.content),
    ).rejects.toThrow(chunkQ.KnowledgeContentChangedError);

    const listed = await chunkQ.listChunks(A, doc.id);
    expect(listed).toHaveLength(0);
  });

  it("cascade-deletes chunks when the document is deleted", async () => {
    const doc = await docs.createDocument(A, { title: "Cascade doc" });
    const saved = await chunkQ.createChunks(
      A,
      doc.id,
      chunkFn.chunkDocument("d".repeat(2200)),
    );
    await docs.deleteDocument(A, doc.id);
    const rows = await db
      .select()
      .from(schema.knowledgeChunk)
      .where(eq(schema.knowledgeChunk.documentId, doc.id));
    expect(rows.length).toBe(0);
    expect(saved.length).toBeGreaterThan(0);
  });

  it("enforces ownership through the parent document", async () => {
    const doc = await docs.createDocument(A, { title: "Owned" });
    await chunkQ.createChunks(A, doc.id, chunkFn.chunkDocument("e".repeat(1500)));

    expect(await chunkQ.createChunks(B, doc.id, [{ chunkIndex: 0, content: "x" }])).toBeNull();
    expect(await chunkQ.listChunks(B, doc.id)).toBeNull();
    expect(await chunkQ.deleteChunks(B, doc.id)).toBeNull();

    // A's chunks intact
    const listed = await chunkQ.listChunks(A, doc.id);
    expect(listed.length).toBeGreaterThan(0);
  });

  it("maintains user isolation", async () => {
    const doc = await docs.createDocument(A, { title: "Isolation" });
    await chunkQ.createChunks(A, doc.id, chunkFn.chunkDocument("f".repeat(1100)));
    // B sees nothing for A's document
    expect(await chunkQ.listChunks(B, doc.id)).toBeNull();
  });
});
