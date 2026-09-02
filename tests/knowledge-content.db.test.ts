import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";

// DB-backed document-content storage tests. Skipped without DATABASE_URL.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("knowledge content storage (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let docs: any;
  let content: any;
  let A = "";
  let B = "";

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    docs = await import("@/lib/db/knowledge-queries");
    content = await import("@/lib/db/knowledge-content-queries");

    const s = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const mk = async (email: string) =>
      (await db.insert(schema.users).values({ email }).returning())[0].id;
    A = await mk(`kc-A-${s}@example.com`);
    B = await mk(`kc-B-${s}@example.com`);
  });

  afterAll(async () => {
    if (!db || !schema || !A) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
  });

  it("creates, retrieves, updates content for the owner", async () => {
    const doc = await docs.createDocument(A, { title: "Doc 1" });

    const created = await content.createContent(A, doc.id, "hello world");
    expect(created?.content).toBe("hello world");

    const got = await content.getContent(A, doc.id);
    expect(got?.content).toBe("hello world");

    const updated = await content.updateContent(A, doc.id, "updated text");
    expect(updated?.content).toBe("updated text");
    expect((await content.getContent(A, doc.id))?.content).toBe("updated text");
  });

  it("invalidates derived chunks atomically when content changes", async () => {
    const doc = await docs.createDocument(A, { title: "Invalidate index" });
    await content.createContent(A, doc.id, "old canonical text");
    await db.insert(schema.knowledgeChunk).values({
      documentId: doc.id,
      chunkIndex: 0,
      content: "old canonical text",
    });

    const updated = await content.updateContent(A, doc.id, "new canonical text");
    expect(updated?.content).toBe("new canonical text");

    const chunks = await db
      .select()
      .from(schema.knowledgeChunk)
      .where(eq(schema.knowledgeChunk.documentId, doc.id));
    expect(chunks).toHaveLength(0);
  });

  it("deletes content", async () => {
    const doc = await docs.createDocument(A, { title: "Doc 2" });
    await content.createContent(A, doc.id, "to remove");
    const del = await content.deleteContent(A, doc.id);
    expect(del?.documentId).toBe(doc.id);
    expect(await content.getContent(A, doc.id)).toBeNull();
    const chunks = await db
      .select()
      .from(schema.knowledgeChunk)
      .where(eq(schema.knowledgeChunk.documentId, doc.id));
    expect(chunks).toHaveLength(0);
  });

  it("cascade-deletes content when the document is deleted", async () => {
    const doc = await docs.createDocument(A, { title: "Doc 3" });
    const c = await content.createContent(A, doc.id, "cascade me");
    // delete the parent document
    await docs.deleteDocument(A, doc.id);
    const rows = await db
      .select()
      .from(schema.knowledgeContent)
      .where(eq(schema.knowledgeContent.id, c.id));
    expect(rows.length).toBe(0);
  });

  it("enforces ownership through the parent document", async () => {
    const doc = await docs.createDocument(A, { title: "A private" });
    await content.createContent(A, doc.id, "secret");

    // B cannot read/create/update/delete A's content
    expect(await content.getContent(B, doc.id)).toBeNull();
    expect(await content.createContent(B, doc.id, "x")).toBeNull();
    expect(await content.updateContent(B, doc.id, "x")).toBeNull();
    expect(await content.deleteContent(B, doc.id)).toBeNull();

    // A's content still intact
    expect((await content.getContent(A, doc.id))?.content).toBe("secret");
  });

  it("maintains user isolation (B cannot create content on A's doc)", async () => {
    const doc = await docs.createDocument(A, { title: "Isolation" });
    const blocked = await content.createContent(B, doc.id, "B wrote this");
    expect(blocked).toBeNull();
    // no content was created
    expect(await content.getContent(A, doc.id)).toBeNull();
  });
});
