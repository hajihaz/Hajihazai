import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("knowledge chunk embeddings (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let docs: any;
  let chunkQ: any;
  let chunkFn: any;
  let embedSvc: any;
  let embQ: any;
  let rawSql: any;
  let A = "";
  let B = "";
  let ready = false;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    docs = await import("@/lib/db/knowledge-queries");
    chunkQ = await import("@/lib/db/knowledge-chunk-queries");
    chunkFn = await import("@/lib/knowledge/chunk");
    embedSvc = await import("@/lib/knowledge/embed-chunks");
    embQ = await import("@/lib/db/knowledge-embedding-queries");
    const postgres = (await import("postgres")).default;
    rawSql = postgres(process.env.DATABASE_URL as string);

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

    const s = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const mk = async (email: string) =>
      (await db.insert(schema.users).values({ email }).returning())[0].id;
    A = await mk(`ke-A-${s}@example.com`);
    B = await mk(`ke-B-${s}@example.com`);
  });

  afterAll(async () => {
    if (!db || !schema || !A) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
  });

  it("HNSW index exists on knowledge_chunk.embedding", async () => {
    const rows = await rawSql`
      select indexdef from pg_indexes
      where tablename='knowledge_chunk' and indexname='knowledge_chunk_embedding_idx'`;
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef.toLowerCase()).toContain("hnsw");
  });

  it("generates and persists 768-dim vectors for all chunks", async () => {
    if (!ready) {
      console.warn("  (skipped — nomic-embed-text absent)");
      return;
    }
    const doc = await docs.createDocument(A, { title: "Embed doc" });
    await chunkQ.createChunks(A, doc.id, chunkFn.chunkDocument("hello ".repeat(400)));

    const result = await embedSvc.embedDocumentChunks(A, doc.id);
    expect(result.dimensions).toBe(768);
    expect(result.embedded).toBe(result.total);
    expect(result.embedded).toBeGreaterThan(0);

    // every chunk row has a 768-length vector
    const dims = await rawSql`
      select array_length(string_to_array(trim(both '[]' from embedding::text), ','), 1) as dims
      from knowledge_chunk where "documentId"=${doc.id} and embedding is not null`;
    expect(dims.every((d: any) => d.dims === 768)).toBe(true);

    const status = await embQ.getChunkEmbeddingStatus(A, doc.id);
    expect(status.embedded).toBe(status.total);
  });

  it("enforces ownership through the parent document", async () => {
    if (!ready) return;
    const doc = await docs.createDocument(A, { title: "Owned embed" });
    await chunkQ.createChunks(A, doc.id, chunkFn.chunkDocument("x".repeat(1100)));

    // B cannot embed or read status of A's document
    expect(await embedSvc.embedDocumentChunks(B, doc.id)).toBeNull();
    expect(await embQ.getChunkEmbeddingStatus(B, doc.id)).toBeNull();
    expect(
      await embQ.storeChunkEmbedding(B, doc.id, "whatever", new Array(768).fill(0)),
    ).toBeNull();
  });

  it("maintains user isolation (A's embed does not touch B's chunks)", async () => {
    if (!ready) return;
    const aDoc = await docs.createDocument(A, { title: "A doc" });
    const bDoc = await docs.createDocument(B, { title: "B doc" });
    await chunkQ.createChunks(A, aDoc.id, chunkFn.chunkDocument("a".repeat(1100)));
    await chunkQ.createChunks(B, bDoc.id, chunkFn.chunkDocument("b".repeat(1100)));

    await embedSvc.embedDocumentChunks(A, aDoc.id);

    // B's chunks remain unembedded
    const bRows = await rawSql`
      select count(*)::int as n from knowledge_chunk
      where "documentId"=${bDoc.id} and embedding is not null`;
    expect(bRows[0].n).toBe(0);
  });
});
