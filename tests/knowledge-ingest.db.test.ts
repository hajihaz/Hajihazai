import { describe, it, expect, beforeAll, afterAll } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("knowledge ingestion (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, schema: any, ing: any, pq: any;
  let A = "", projId = "";

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    ing = await import("@/lib/knowledge/ingest");
    pq = await import("@/lib/db/project-queries");
    const s = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    A = (
      await db.insert(schema.users).values({ email: `ki-${s}@x.com` }).returning()
    )[0].id;
    projId = (await pq.createProject(A, { name: "Personal" })).id;
  });

  afterAll(async () => {
    if (!db || !A) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A]));
  });

  it("ingests a TXT file into chunks under a project", async () => {
    const text = "Haji studies at Example College. ".repeat(120); // > 1 chunk
    const r = await ing.ingestDocument(A, {
      filename: "personal.txt",
      buffer: Buffer.from(text),
      projectId: projId,
      title: "Personal",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.chunks).toBeGreaterThan(0);
      const { eq } = await import("drizzle-orm");
      const [doc] = await db
        .select()
        .from(schema.knowledgeDocument)
        .where(eq(schema.knowledgeDocument.id, r.documentId));
      expect(doc.projectId).toBe(projId);
      expect(doc.userId).toBe(A);
      expect(doc.status).toBe("active");

      const chunks = await db
        .select()
        .from(schema.knowledgeChunk)
        .where(eq(schema.knowledgeChunk.documentId, r.documentId));
      expect(chunks.length).toBe(r.chunks);
    }
  });

  it("rejects PDF uploads until a parser is configured", async () => {
    const r = await ing.ingestDocument(A, {
      filename: "doc.pdf",
      buffer: Buffer.from("%PDF-1.4"),
      projectId: null,
    });
    expect(r.ok).toBe(false);
  });

  it("rejects empty files", async () => {
    const r = await ing.ingestDocument(A, {
      filename: "empty.txt",
      buffer: Buffer.from(""),
      projectId: null,
    });
    expect(r.ok).toBe(false);
  });
});
