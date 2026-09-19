import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("project memory scope (db)", () => {
  let db: any, schema: any, pq: any, retrieve: any;
  let userA = "", userB = "", projectA = "", projectB = "";
  let globalMemory = "", projectMemoryA = "", projectMemoryB = "";

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    pq = await import("@/lib/db/project-queries");
    retrieve = await import("@/lib/memory/retrieve");

    const suffix = String(Date.now()) + "-" + String(Math.round(Math.random() * 1e6));
    const [a] = await db.insert(schema.users).values({ email: "project-memory-a-" + suffix + "@x.com" }).returning();
    const [b] = await db.insert(schema.users).values({ email: "project-memory-b-" + suffix + "@x.com" }).returning();
    userA = a.id;
    userB = b.id;

    const [pa] = await db.insert(schema.projects).values({ userId: userA, name: "Project A" }).returning();
    const [pb] = await db.insert(schema.projects).values({ userId: userA, name: "Project B" }).returning();
    projectA = pa.id;
    projectB = pb.id;

    const validFrom = new Date("2020-01-01T00:00:00.000Z");
    const [global] = await db.insert(schema.userMemory).values({ userId: userA, type: "note", content: "Global memory is available in every project.", validFrom }).returning();
    const [attachedA] = await db.insert(schema.userMemory).values({ userId: userA, type: "note", content: "Only Project A should see this memory.", validFrom }).returning();
    const [attachedB] = await db.insert(schema.userMemory).values({ userId: userA, type: "note", content: "Only Project B should see this memory.", validFrom }).returning();
    globalMemory = global.id;
    projectMemoryA = attachedA.id;
    projectMemoryB = attachedB.id;
  });

  afterAll(async () => {
    if (db && userA) await db.delete(schema.users).where(eq(schema.users.id, userA));
    if (db && userB) await db.delete(schema.users).where(eq(schema.users.id, userB));
  });

  it("attaches and retrieves only global + current-project memories", async () => {
    expect(await pq.attachMemoryToProject(userA, projectA, projectMemoryA)).toBeTruthy();
    expect(await pq.attachMemoryToProject(userA, projectB, projectMemoryB)).toBeTruthy();

    const a = await retrieve.getActiveMemories(userA, projectA);
    const aIds = a.map((m: any) => m.id);
    expect(aIds).toContain(globalMemory);
    expect(aIds).toContain(projectMemoryA);
    expect(aIds).not.toContain(projectMemoryB);

    const b = await retrieve.getActiveMemories(userA, projectB);
    const bIds = b.map((m: any) => m.id);
    expect(bIds).toContain(globalMemory);
    expect(bIds).toContain(projectMemoryB);
    expect(bIds).not.toContain(projectMemoryA);
  });

  it("prevents cross-user project and memory attachment", async () => {
    expect(await pq.attachMemoryToProject(userB, projectA, globalMemory)).toBeNull();
    expect(await pq.attachMemoryToProject(userA, projectA, "missing-memory")).toBeNull();
    expect(await pq.getProject(userB, projectA)).toBeNull();
  });

  it("detaches explicit memory without removing the underlying global memory", async () => {
    expect(await pq.detachMemoryFromProject(userA, projectA, projectMemoryA)).toBeTruthy();
    const attached = await pq.listProjectMemories(userA, projectA);
    expect(attached.some((row: any) => row.memory.id === projectMemoryA)).toBe(false);

    const a = await retrieve.getActiveMemories(userA, projectA);
    expect(a.map((m: any) => m.id)).toContain(globalMemory);
    // Detaching makes the memory unscoped again, so it is available to project chats.
    expect(a.map((m: any) => m.id)).toContain(projectMemoryA);

    const [memory] = await db.select().from(schema.userMemory).where(eq(schema.userMemory.id, projectMemoryA));
    expect(memory?.content).toContain("Only Project A");
  });

  it("removes project links when a project is deleted while preserving memories", async () => {
    expect(await pq.attachMemoryToProject(userA, projectA, projectMemoryA)).toBeTruthy();
    expect(await pq.deleteProject(userA, projectA)).toBe(true);

    const links = await db.select().from(schema.projectMemories).where(eq(schema.projectMemories.projectId, projectA));
    expect(links).toHaveLength(0);

    const [memory] = await db.select().from(schema.userMemory).where(and(eq(schema.userMemory.id, projectMemoryA), eq(schema.userMemory.userId, userA)));
    expect(memory?.content).toContain("Only Project A");
  });
});
