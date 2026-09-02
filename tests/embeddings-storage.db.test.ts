import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { updateMemory } from "@/lib/db/memory-queries";

// DB + Ollama-backed vector storage tests. Skipped without DATABASE_URL.
// The embedding model (Ollama nomic-embed-text) is probed in beforeAll; if
// unavailable, the embedding-generation assertions are skipped (schema/index
// checks still run).
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("pgvector storage & isolation (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let svc: any;
  let rawSql: any;
  let A = "";
  let B = "";
  let ollamaReady = false;

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    svc = await import("@/lib/memory/embed-memory");
    const { neon } = await import("@neondatabase/serverless");
    rawSql = neon(process.env.DATABASE_URL as string);

    try {
      const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api";
      const res = await fetch(`${base}/tags`);
      const data = await res.json();
      ollamaReady =
        res.ok &&
        Array.isArray(data?.models) &&
        data.models.some((m: { name: string }) =>
          m.name.includes("nomic-embed-text"),
        );
    } catch {
      ollamaReady = false;
    }

    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const [ua] = await db
      .insert(schema.users)
      .values({ email: `vec-A-${stamp}@example.com` })
      .returning();
    const [ub] = await db
      .insert(schema.users)
      .values({ email: `vec-B-${stamp}@example.com` })
      .returning();
    A = ua.id;
    B = ub.id;
  });

  afterAll(async () => {
    if (!db || !schema) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
  });

  it("pgvector extension is enabled", async () => {
    const rows = await rawSql`select extname from pg_extension where extname='vector'`;
    expect(rows.length).toBe(1);
  });

  it("HNSW index exists on user_memory.embedding", async () => {
    const rows = await rawSql`
      select indexdef from pg_indexes
      where tablename='user_memory' and indexname='user_memory_embedding_idx'`;
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef.toLowerCase()).toContain("hnsw");
  });

  it("stores a 768-dim vector for the owner's memories", async () => {
    if (!ollamaReady) {
      console.warn("  (skipped embedding generation — nomic-embed-text absent)");
      return;
    }
    await svc.embedMemory; // ensure import resolved
    const [m] = await db
      .insert(schema.userMemory)
      .values({ userId: A, content: "Owns Suplaykart", status: "active" })
      .returning();

    const result = await svc.embedMemory(A, m.id);
    expect(result?.dimensions).toBe(768);

    // Read back the stored vector length via SQL (vector → text → element count).
    const rows = await rawSql`
      select array_length(string_to_array(trim(both '[]' from embedding::text), ','), 1) as dims
      from user_memory where id=${m.id}`;
    expect(rows[0].dims).toBe(768);
  });

  it("embedAllMemories only touches the caller's active memories (isolation)", async () => {
    if (!ollamaReady) {
      console.warn("  (skipped embedding generation — nomic-embed-text absent)");
      return;
    }
    const [bm] = await db
      .insert(schema.userMemory)
      .values({ userId: B, content: "B private fact", status: "active" })
      .returning();

    const res = await svc.embedAllMemories(A);
    expect(res.embedded).toBeGreaterThanOrEqual(1);
    expect(res.dimensions).toBe(768);

    // B's memory must remain unembedded (NULL).
    const bRows = await rawSql`select embedding from user_memory where id=${bm.id}`;
    expect(bRows[0].embedding).toBeNull();
  });

  it("invalidates the old embedding when memory content changes", async () => {
    if (!ollamaReady) {
      console.warn("  (skipped embedding generation — nomic-embed-text absent)");
      return;
    }
    const [m] = await db
      .insert(schema.userMemory)
      .values({ userId: A, content: "Original semantic fact", status: "active" })
      .returning();

    await svc.embedMemory(A, m.id);
    const before = await rawSql`select embedding from user_memory where id=${m.id}`;
    expect(before[0].embedding).not.toBeNull();

    const updated = await updateMemory(A, m.id, { content: "Replacement semantic fact" });
    expect(updated?.content).toBe("Replacement semantic fact");
    const after = await rawSql`select embedding from user_memory where id=${m.id}`;
    expect(after[0].embedding).toBeNull();
  });

  it("does not allow a stale embedding write after a concurrent edit", async () => {
    const [m] = await db
      .insert(schema.userMemory)
      .values({ userId: A, content: "Original race-sensitive fact", status: "active" })
      .returning();
    const snapshot = { updatedAt: m.updatedAt, content: m.content };

    await updateMemory(A, m.id, { content: "Newer race-sensitive fact" });

    const staleVector = Array.from({ length: 768 }, () => 0);
    const rows = await db
      .update(schema.userMemory)
      .set({ embedding: staleVector })
      .where(
        (await import("drizzle-orm")).and(
          (await import("drizzle-orm")).eq(schema.userMemory.id, m.id),
          (await import("drizzle-orm")).eq(schema.userMemory.userId, A),
          (await import("drizzle-orm")).eq(schema.userMemory.updatedAt, snapshot.updatedAt),
          (await import("drizzle-orm")).eq(schema.userMemory.content, snapshot.content),
          (await import("drizzle-orm")).eq(schema.userMemory.status, "active"),
        ),
      )
      .returning({ id: schema.userMemory.id });

    expect(rows).toHaveLength(0);
    const after = await rawSql`select embedding from user_memory where id=${m.id}`;
    expect(after[0].embedding).toBeNull();
  });

  it("embedMemory refuses a non-owner (isolation)", async () => {
    const [am] = await db
      .insert(schema.userMemory)
      .values({ userId: A, content: "A only", status: "active" })
      .returning();
    // B tries to embed A's memory → null (not owned).
    const result = await svc.embedMemory(B, am.id);
    expect(result).toBeNull();
  });
});
