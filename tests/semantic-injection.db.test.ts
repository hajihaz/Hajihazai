import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Semantic memory injection (buildMemoryContext). Skipped without DB / model.
const hasDb = !!process.env.DATABASE_URL;
const QUERY = "does the user run a coffee business";

describe.skipIf(!hasDb)("semantic memory injection (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let embedSvc: any;
  let context: any;
  let A = "";
  let B = "";
  let C = "";
  let ready = false;
  const ids: Record<string, string> = {};

  async function addMemory(userId: string, content: string, status: string) {
    const [row] = await db
      .insert(schema.userMemory)
       .values({ userId, content, status, validFrom: new Date(), updatedAt: new Date() })
      .returning();
    return row.id as string;
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    embedSvc = await import("@/lib/memory/embed-memory");
    context = await import("@/lib/memory/context");

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
    A = await mk(`inj-A-${s}@example.com`);
    B = await mk(`inj-B-${s}@example.com`);
    C = await mk(`inj-C-${s}@example.com`);

    // A: related active, unrelated active, pending + deleted (coffee text)
    ids.r1 = await addMemory(A, "The user runs a coffee business called BeanWorks.", "active");
    ids.unrelated = await addMemory(A, "The user is allergic to peanuts.", "active");
    ids.pending = await addMemory(A, "The user runs a coffee business called BeanWorks.", "pending");
    ids.deleted = await addMemory(A, "The user runs a coffee business called BeanWorks.", "deleted");
    // B: same coffee text → isolation
    ids.bRelated = await addMemory(B, "The user runs a coffee business called BeanWorks.", "active");
    // C: active but NEVER embedded → forces semantic miss → fallback
    ids.c1 = await addMemory(C, "The user collects vintage stamps.", "active");
    ids.c2 = await addMemory(C, "The user plays tennis on weekends.", "active");

    await embedSvc.embedAllMemories(A); // r1 + unrelated
    // Keep the unrelated vector deterministically below the retrieval threshold.
    await db.update(schema.userMemory).set({ embedding: [-1, ...Array.from({ length: 767 }, () => 0)] }).where((await import("drizzle-orm")).eq(schema.userMemory.id, ids.unrelated));
    await embedSvc.embedMemory(A, ids.pending);
    await embedSvc.embedMemory(A, ids.deleted);
    await embedSvc.embedAllMemories(B); // bRelated
    // C intentionally NOT embedded
  });

  afterAll(async () => {
    if (!db || !schema || !A) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A, B, C]));
  });

  it("injects relevant memories and excludes unrelated", async () => {
    if (!ready) return;
    const ctx = await context.buildMemoryContext(A, { query: QUERY });
    const hitIds = ctx.memories.map((m: any) => m.id);
    expect(ctx.fallbackUsed).toBe(false);
    expect(hitIds).toContain(ids.r1);
    expect(ctx.block).toContain("coffee business");
  });

  it("excludes pending and deleted (even when embedded)", async () => {
    if (!ready) return;
    const ctx = await context.buildMemoryContext(A, { query: QUERY });
    const hitIds = ctx.memories.map((m: any) => m.id);
    expect(hitIds).not.toContain(ids.pending);
    expect(hitIds).not.toContain(ids.deleted);
  });

  it("maintains user isolation", async () => {
    if (!ready) return;
    const ctx = await context.buildMemoryContext(A, { query: QUERY });
    const hitIds = ctx.memories.map((m: any) => m.id);
    expect(hitIds).not.toContain(ids.bRelated);
  });

  it("falls back to keyword retrieval when semantic returns nothing", async () => {
    if (!ready) return;
    // C's memories are unembedded → semantic finds 0 → fallback.
    const ctx = await context.buildMemoryContext(C, { query: QUERY });
    expect(ctx.fallbackUsed).toBe(true);
    expect(ctx.count).toBeGreaterThan(0);
    const hitIds = ctx.memories.map((m: any) => m.id);
    expect(hitIds).toContain(ids.c1);
    expect(ctx.block).toContain("stamps");
  });

  it("falls back when no query is provided", async () => {
    if (!ready) return;
    const ctx = await context.buildMemoryContext(A, {});
    expect(ctx.fallbackUsed).toBe(true);
  });
});
