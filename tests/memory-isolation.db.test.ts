import { describe, it, expect, beforeAll, afterAll } from "vitest";

// DB-backed ownership/isolation tests. Skipped automatically when no
// DATABASE_URL is configured (e.g. CI without a database). All DB imports are
// lazy so the file loads even without a connection string.
const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("memory ownership & isolation (db)", () => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let db: any;
  let schema: any;
  let q: any;
  let retrieve: any;
  let A = "";
  let B = "";

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    q = await import("@/lib/db/memory-queries");
    retrieve = await import("@/lib/memory/retrieve");

    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const [ua] = await db
      .insert(schema.users)
      .values({ email: `vitest-A-${stamp}@example.com` })
      .returning();
    const [ub] = await db
      .insert(schema.users)
      .values({ email: `vitest-B-${stamp}@example.com` })
      .returning();
    A = ua.id;
    B = ub.id;
  });

  afterAll(async () => {
    if (!db || !schema) return;
    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [A, B]));
  });

  it("lists only the owner's memories (isolation)", async () => {
    await q.createMemory(A, { content: "A fact", status: "active" });
    await q.createMemory(B, { content: "B fact", status: "active" });

    const aList = await q.listMemories(A);
    expect(aList.every((m: any) => m.userId === A)).toBe(true);
    expect(aList.some((m: any) => m.content === "B fact")).toBe(false);
  });

  it("blocks update/delete by a non-owner", async () => {
    const m = await q.createMemory(A, { content: "A private", status: "active" });
    expect(await q.updateMemory(B, m.id, { content: "hacked" })).toBeNull();
    expect(await q.deleteMemory(B, m.id)).toBeNull();

    const aList = await q.listMemories(A);
    expect(
      aList.some((x: any) => x.id === m.id && x.content === "A private"),
    ).toBe(true);
  });

  it("scopes approve + bulk actions to the owner", async () => {
    const p = await q.createMemory(A, { content: "A pending", status: "pending" });
    expect(await q.approveMemory(B, p.id)).toBeNull();
    expect((await q.bulkDelete(B, [p.id])).length).toBe(0);

    const ok = await q.approveMemory(A, p.id);
    expect(ok?.status).toBe("active");
  });

  it("retrieves active-only, scoped to the user", async () => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const [uc] = await db
      .insert(schema.users)
      .values({ email: `vitest-C-${stamp}@example.com` })
      .returning();
    await q.createMemory(uc.id, { content: "active one", status: "active" });
    await q.createMemory(uc.id, { content: "pending one", status: "pending" });
    await q.createMemory(uc.id, { content: "deleted one", status: "deleted" });

    const active = await retrieve.getActiveMemories(uc.id);
    expect(active.every((m: any) => m.status === "active" && m.userId === uc.id)).toBe(
      true,
    );
    expect(active.some((m: any) => m.content === "pending one")).toBe(false);
    expect(active.some((m: any) => m.content === "deleted one")).toBe(false);

    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [uc.id]));
  });

  it("diagnostics applies temporal validity and explains excluded active memories", async () => {
    const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const [ud] = await db
      .insert(schema.users)
      .values({ email: `vitest-D-${stamp}@example.com` })
      .returning();

    const active = await q.createMemory(ud.id, { content: "currently valid coffee fact", status: "active" });
    const expired = await q.createMemory(ud.id, { content: "expired coffee fact", status: "active" });
    const future = await q.createMemory(ud.id, { content: "future coffee fact", status: "active" });

    const now = Date.now();
    await db
      .update(schema.userMemory)
      .set({ validUntil: new Date(now - 60_000) })
      .where((await import("drizzle-orm")).eq(schema.userMemory.id, expired.id));
    await db
      .update(schema.userMemory)
      .set({ validFrom: new Date(now + 60_000) })
      .where((await import("drizzle-orm")).eq(schema.userMemory.id, future.id));

    const diag = await retrieve.searchWithDiagnostics(ud.id, "coffee");
    expect(diag.results.some((m: any) => m.id === active.id)).toBe(true);
    expect(diag.results.some((m: any) => m.id === expired.id)).toBe(false);
    expect(diag.results.some((m: any) => m.id === future.id)).toBe(false);
    expect(diag.excluded.find((m: any) => m.id === expired.id)?.reason).toBe("expired");
    expect(diag.excluded.find((m: any) => m.id === future.id)?.reason).toBe("not-yet-valid");

    const { inArray } = await import("drizzle-orm");
    await db.delete(schema.users).where(inArray(schema.users.id, [ud.id]));
  });

  it("forget-all wipes only the calling user", async () => {
    await q.createMemory(B, { content: "B again", status: "active" });
    await q.forgetAllMemories(B);

    expect((await q.listAllMemories(B)).length).toBe(0);
    expect((await q.listAllMemories(A)).length).toBeGreaterThan(0);
  });
});
