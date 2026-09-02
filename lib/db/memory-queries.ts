import { and, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "./index";
import { userMemory } from "./schema";

type MemoryStatus = "pending" | "active" | "deleted";

const MEMORY_LIST_LIMIT = 500;

/**
 * Phase 5 — Memory data layer.
 * Every function is scoped by userId so a user can only ever touch their own
 * memories (ownership enforced at the query level, not just the route level).
 */

/** Viewer list — everything except soft-deleted (rejected) memories. */
export async function listMemories(userId: string) {
  return db
    .select()
    .from(userMemory)
    .where(and(eq(userMemory.userId, userId), ne(userMemory.status, "deleted")))
    .orderBy(desc(userMemory.updatedAt))
    .limit(MEMORY_LIST_LIMIT);
}

export async function createMemory(
  userId: string,
  input: { type?: string; content: string; status?: MemoryStatus; confidence?: number; validFrom?: Date; validUntil?: Date | null },
) {
  const [row] = await db
    .insert(userMemory)
    .values({
      userId,
      content: input.content,
      ...(input.type ? { type: input.type } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.confidence !== undefined ? { confidence: Math.max(0, Math.min(100, Math.round(input.confidence))) } : {}),
      ...(input.validFrom ? { validFrom: input.validFrom } : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
    })
    .returning();
  return row;
}

export async function updateMemory(
  userId: string,
  id: string,
  input: { type?: string; content?: string; confidence?: number; validUntil?: Date | null },
) {
  const [row] = await db
    .update(userMemory)
    .set({
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.content !== undefined
        ? {
            content: input.content,
            // Content changes invalidate the old vector immediately. The API
            // re-embeds afterward; if embedding fails, semantic retrieval must
            // not silently use a vector generated from different text.
            embedding: null,
          }
        : {}),
      ...(input.confidence !== undefined ? { confidence: Math.max(0, Math.min(100, Math.round(input.confidence))) } : {}),
      ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(userMemory.id, id), eq(userMemory.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteMemory(userId: string, id: string) {
  const [row] = await db
    .delete(userMemory)
    .where(and(eq(userMemory.id, id), eq(userMemory.userId, userId)))
    .returning();
  return row ?? null;
}

/** Approve a pending memory → active. Only acts on the user's own pending rows. */
export async function approveMemory(userId: string, id: string) {
  const [row] = await db
    .update(userMemory)
    .set({ status: "active", updatedAt: new Date() })
    .where(
      and(
        eq(userMemory.id, id),
        eq(userMemory.userId, userId),
        eq(userMemory.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

/** Reject a pending memory → soft-deleted. Only acts on the user's own pending rows. */
export async function rejectMemory(userId: string, id: string) {
  const [row] = await db
    .update(userMemory)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(
      and(
        eq(userMemory.id, id),
        eq(userMemory.userId, userId),
        eq(userMemory.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

/** Content keys of all non-deleted memories (used to dedupe extraction). */
export async function existingMemoryContents(userId: string) {
  const rows = await listMemories(userId);
  return new Set(rows.map((m) => m.content.trim().toLowerCase()));
}

/** Mark an existing memory as superseded by a newer memory. History remains intact. */
export async function supersedeMemory(userId: string, oldId: string, newId: string, at = new Date()) {
  if (oldId === newId) return null;

  // The replacement must belong to the same user and already be active.
  // Keep the reference scoped to the same tenant so lifecycle history can never
  // point at another user's memory (or an arbitrary/nonexistent ID).
  const [replacement] = await db
    .select({ id: userMemory.id })
    .from(userMemory)
    .where(and(
      eq(userMemory.id, newId),
      eq(userMemory.userId, userId),
      eq(userMemory.status, "active"),
    ))
    .limit(1);
  if (!replacement) return null;

  const [row] = await db
    .update(userMemory)
    .set({ validUntil: at, supersededBy: newId, updatedAt: at })
    .where(and(eq(userMemory.id, oldId), eq(userMemory.userId, userId), eq(userMemory.status, "active")))
    .returning();
  return row ?? null;
}

/** Expire a memory without deleting it, preserving the historical record. */
export async function expireMemory(userId: string, id: string, at = new Date()) {
  const [row] = await db
    .update(userMemory)
    .set({ validUntil: at, updatedAt: at })
    .where(and(eq(userMemory.id, id), eq(userMemory.userId, userId), eq(userMemory.status, "active")))
    .returning();
  return row ?? null;
}

/* ---------------------- Phase 5 Step 5: management ----------------------- */

/** Every memory for the user, all statuses (management view + export). */
export async function listAllMemories(userId: string) {
  return db
    .select()
    .from(userMemory)
    .where(eq(userMemory.userId, userId))
    .orderBy(desc(userMemory.updatedAt))
    .limit(MEMORY_LIST_LIMIT);
}

export interface MemoryStats {
  active: number;
  pending: number;
  deleted: number;
  total: number;
}

export async function memoryStats(userId: string): Promise<MemoryStats> {
  const [row] = await db
    .select({
      active: sql<number>`count(*) filter (where ${userMemory.status} = 'active')`.mapWith(Number),
      pending: sql<number>`count(*) filter (where ${userMemory.status} = 'pending')`.mapWith(Number),
      deleted: sql<number>`count(*) filter (where ${userMemory.status} = 'deleted')`.mapWith(Number),
      total: count(),
    })
    .from(userMemory)
    .where(eq(userMemory.userId, userId));

  return {
    active: row?.active ?? 0,
    pending: row?.pending ?? 0,
    deleted: row?.deleted ?? 0,
    total: row?.total ?? 0,
  };
}

/** Bulk approve — only the user's own PENDING rows transition to active. */
export async function bulkApprove(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .update(userMemory)
    .set({ status: "active", updatedAt: new Date() })
    .where(
      and(
        eq(userMemory.userId, userId),
        inArray(userMemory.id, ids),
        eq(userMemory.status, "pending"),
      ),
    )
    .returning();
}

/** Bulk reject — only the user's own PENDING rows transition to deleted. */
export async function bulkReject(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .update(userMemory)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(
      and(
        eq(userMemory.userId, userId),
        inArray(userMemory.id, ids),
        eq(userMemory.status, "pending"),
      ),
    )
    .returning();
}

/** Bulk hard-delete — only the user's own rows (any status). */
export async function bulkDelete(userId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return db
    .delete(userMemory)
    .where(and(eq(userMemory.userId, userId), inArray(userMemory.id, ids)))
    .returning();
}

/** Delete EVERY memory for the user (right-to-be-forgotten) without materializing all deleted rows. */
export async function forgetAllMemories(userId: string): Promise<number> {
  const result = await db.execute(sql`
    WITH deleted AS (
      DELETE FROM ${userMemory}
      WHERE ${userMemory.userId} = ${userId}
      RETURNING 1
    )
    SELECT count(*)::int AS count FROM deleted
  `);
  const row = result.rows[0] as { count?: number | string } | undefined;
  return Number(row?.count ?? 0);
}
