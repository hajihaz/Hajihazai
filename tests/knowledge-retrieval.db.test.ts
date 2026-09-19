import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { tokenize } from "@/lib/knowledge/keyword-search";

describe("keyword tokenizer", () => {
  it("keeps content words and drops stopwords", () => {
    const t = tokenize("Which college does Haji study at?");
    expect(t).toContain("haji");
    expect(t).toContain("college");
    expect(t).not.toContain("which");
    expect(t).not.toContain("does");
    expect(t).not.toContain("at");
  });
});

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("knowledge retrieval — overrides hallucination (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any, schema: any, ing: any, ctx: any, pq: any;
  let A = "", projId = "", otherProjId = "", attachedDocId = "";

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    ing = await import("@/lib/knowledge/ingest");
    ctx = await import("@/lib/memory/context");
    pq = await import("@/lib/db/project-queries");
    const s = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    A = (await db.insert(schema.users).values({ email: `kr-${s}@x.com` }).returning())[0].id;
    projId = (await pq.createProject(A, { name: "Personal" })).id;
    otherProjId = (await pq.createProject(A, { name: "Law" })).id;

    // Use a unique phrase that does NOT appear in any global knowledge document.
    const attached = await ing.ingestDocument(A, {
      filename: "haji.txt",
      buffer: Buffer.from(
        "UNIQUE_KR_TESTPHRASE_ZQ9: User A studies at Kattankulathur private project.",
      ),
      projectId: projId,
      title: "About User A (private project)",
    });
    if (!attached.ok) throw new Error(attached.error);
    attachedDocId = attached.documentId;

    const other = await ing.ingestDocument(A, {
      filename: "other.txt",
      buffer: Buffer.from(
        "UNIQUE_KR_OTHERPHRASE_X7: unrelated project document content.",
      ),
      projectId: projId,
      title: "Unrelated project document",
    });
    if (!other.ok) throw new Error(other.error);
  });

  afterAll(async () => {
    if (!db || !A) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A]));
  });

  it("retrieves the answer from project knowledge (keyword fallback works without embeddings)", async () => {
    const k = await ctx.buildKnowledgeContext(A, {
      query: "UNIQUE_KR_TESTPHRASE_ZQ9",
      projectId: projId,
    });
    expect(k.count).toBeGreaterThan(0);
    expect(k.block).toContain("UNIQUE_KR_TESTPHRASE_ZQ9");
  });

  it("does NOT leak private project knowledge across projects", async () => {
    // The unique phrase exists only in projId (private). It must NOT appear
    // when searching from otherProjId. Global docs (visibility='global') may
    // still return other results — that's expected — but the private phrase must not.
    const other = await ctx.buildKnowledgeContext(A, {
      query: "UNIQUE_KR_TESTPHRASE_ZQ9 Kattankulathur",
      projectId: otherProjId,
    });
    expect(other.block).not.toContain("UNIQUE_KR_TESTPHRASE_ZQ9");
  });

  it("restricts retrieval to explicitly attached document IDs", async () => {
    const attachedOnly = await ctx.buildKnowledgeContext(A, {
      query: "UNIQUE_KR_OTHERPHRASE_X7 UNIQUE_KR_TESTPHRASE_ZQ9",
      projectId: projId,
      documentIds: [attachedDocId],
    });
    expect(attachedOnly.block).toContain("UNIQUE_KR_TESTPHRASE_ZQ9");
    expect(attachedOnly.block).not.toContain("UNIQUE_KR_OTHERPHRASE_X7");
  });

  it("does NOT surface private project knowledge in a user-level (non-project) chat", async () => {
    // A private project doc must NOT appear at the user level (projectId=null).
    const userLevel = await ctx.buildKnowledgeContext(A, {
      query: "UNIQUE_KR_TESTPHRASE_ZQ9",
      projectId: null,
    });
    expect(userLevel.block).not.toContain("UNIQUE_KR_TESTPHRASE_ZQ9");
  });
});
