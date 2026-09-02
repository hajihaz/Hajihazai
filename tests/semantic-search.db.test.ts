import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Semantic retrieval tests (DB + Ollama embeddings). Skipped without a DB or
// the nomic-embed-text model. Calibrated query: coffee-business docs score
// ~0.85+ (>= 0.62 threshold), unrelated docs ~0.55 (excluded).
const hasDb = !!process.env.DATABASE_URL;
const QUERY = "does the user run a coffee business";

describe.skipIf(!hasDb)("semantic retrieval (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let embedSvc: any;
  let search: any;
  let A = "";
  let B = "";
  let ready = false;
  const ids: Record<string, string> = {};

  async function addMemory(userId: string, content: string, status: string) {
    const [row] = await db
      .insert(schema.userMemory)
      .values({ userId, content, status })
      .returning();
    return row.id as string;
  }

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    embedSvc = await import("@/lib/memory/embed-memory");
    search = await import("@/lib/memory/semantic-search");

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

    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const [ua] = await db
      .insert(schema.users)
      .values({ email: `sem-A-${stamp}@example.com` })
      .returning();
    const [ub] = await db
      .insert(schema.users)
      .values({ email: `sem-B-${stamp}@example.com` })
      .returning();
    A = ua.id;
    B = ub.id;

    // A: related (active), unrelated (active), pending + deleted (same text as related)
    ids.r1 = await addMemory(A, "The user runs a coffee business called BeanWorks.", "active");
    ids.r2 = await addMemory(A, "The user owns several coffee shops.", "active");
    ids.unrelated = await addMemory(A, "The user is allergic to peanuts.", "active");
    ids.pending = await addMemory(A, "The user runs a coffee business called BeanWorks.", "pending");
    ids.deleted = await addMemory(A, "The user runs a coffee business called BeanWorks.", "deleted");
    // B: same related text → must never appear in A's results
    ids.bRelated = await addMemory(B, "The user runs a coffee business called BeanWorks.", "active");

    // Embed: active via embedAll; pending/deleted explicitly (to prove status
    // filter excludes them even WITH a stored vector).
    await embedSvc.embedAllMemories(A);
    await embedSvc.embedMemory(A, ids.pending);
    await embedSvc.embedMemory(A, ids.deleted);
    await embedSvc.embedAllMemories(B);
  });

  afterAll(async () => {
    if (!db || !schema || !A) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
  });

  it("returns semantically related memories; excludes unrelated", async () => {
    if (!ready) return;
    const hits = await search.semanticSearch(A, QUERY, 10);
    const hitIds = hits.map((h: any) => h.id);
    expect(hitIds).toContain(ids.r1);
    expect(hitIds).toContain(ids.r2);
    expect(hitIds).not.toContain(ids.unrelated); // ~0.55 < 0.70
    expect(hits.every((h: any) => h.similarity >= 0.7)).toBe(true);
  });

  it("excludes pending and deleted memories (even when embedded)", async () => {
    if (!ready) return;
    const hits = await search.semanticSearch(A, QUERY, 10);
    const hitIds = hits.map((h: any) => h.id);
    expect(hitIds).not.toContain(ids.pending);
    expect(hitIds).not.toContain(ids.deleted);
  });

  it("excludes expired and not-yet-valid memories", async () => {
    if (!ready) return;
    const expired = await addMemory(A, "The user runs an expired coffee business.", "active");
    const future = await addMemory(A, "The user will run a future coffee business.", "active");

    await db.update(schema.userMemory).set({
      validUntil: new Date(Date.now() - 60_000),
    }).where((await import("drizzle-orm")).eq(schema.userMemory.id, expired));
    await db.update(schema.userMemory).set({
      validFrom: new Date(Date.now() + 60_000),
    }).where((await import("drizzle-orm")).eq(schema.userMemory.id, future));

    await embedSvc.embedMemory(A, expired);
    await embedSvc.embedMemory(A, future);

    const hits = await search.semanticSearch(A, QUERY, 10);
    const hitIds = hits.map((h: any) => h.id);
    expect(hitIds).not.toContain(expired);
    expect(hitIds).not.toContain(future);
  });

  it("maintains user isolation", async () => {
    if (!ready) return;
    const hits = await search.semanticSearch(A, QUERY, 10);
    const hitIds = hits.map((h: any) => h.id);
    expect(hitIds).not.toContain(ids.bRelated);
    // every returned id belongs to A's active set
    expect(hitIds.every((id: string) => [ids.r1, ids.r2].includes(id))).toBe(true);
  });

  it("sorts scores descending", async () => {
    if (!ready) return;
    const hits = await search.semanticSearch(A, QUERY, 10);
    for (let i = 1; i < hits.length; i++) {
      expect(hits[i - 1].similarity).toBeGreaterThanOrEqual(hits[i].similarity);
    }
  });
});
