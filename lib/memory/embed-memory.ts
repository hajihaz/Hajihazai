import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userMemory } from "@/lib/db/schema";
import { getActiveMemories } from "./retrieve";
import { embed } from "@/lib/ai/embeddings/router";

/**
 * Vector storage for memories (Phase 6.1).
 * Generates embeddings via the embedding router and stores them in the
 * pgvector column. No retrieval / similarity search here — storage only.
 * Every operation is user-scoped.
 */

/** Embed a single memory the user owns; store the vector. */
export async function embedMemory(userId: string, memoryId: string) {
  const [mem] = await db
    .select()
    .from(userMemory)
    .where(and(eq(userMemory.id, memoryId), eq(userMemory.userId, userId)));
  if (!mem) return null;

  const { embedding, dimensions, modelId } = await embed(mem.content);
  // Optimistic concurrency: only attach the vector if the row is still the
  // same version we embedded. A concurrent content/validity/status mutation
  // changes updatedAt, so an old embedding can never be resurrected.
  const [stored] = await db
    .update(userMemory)
    .set({ embedding })
    .where(
      and(
        eq(userMemory.id, memoryId),
        eq(userMemory.userId, userId),
        eq(userMemory.updatedAt, mem.updatedAt),
        eq(userMemory.content, mem.content),
        eq(userMemory.status, "active"),
      ),
    )
    .returning({ id: userMemory.id });

  return { id: memoryId, dimensions, modelId, stored: !!stored };
}

/** Embed all of the user's ACTIVE memories; store the vectors. */
export async function embedAllMemories(userId: string) {
  const active = await getActiveMemories(userId);
  let embedded = 0;
  let dimensions = 0;

  for (const m of active) {
    const result = await embed(m.content);
    // Same optimistic-concurrency guard as single-memory embedding: do not
    // overwrite a newer edit/expiry/status transition with an old vector.
    const [stored] = await db
      .update(userMemory)
      .set({ embedding: result.embedding })
      .where(
        and(
          eq(userMemory.id, m.id),
          eq(userMemory.userId, userId),
          eq(userMemory.updatedAt, m.updatedAt),
          eq(userMemory.content, m.content),
          eq(userMemory.status, "active"),
        ),
      )
      .returning({ id: userMemory.id });
    if (stored) embedded++;
    dimensions = result.dimensions;
  }

  return { embedded, total: active.length, dimensions };
}

/** Embedding status per memory (debug view) — never returns raw vectors. */
export async function memoryEmbeddingStatus(userId: string) {
  const rows = await db
    .select({
      id: userMemory.id,
      content: userMemory.content,
      status: userMemory.status,
      embedding: userMemory.embedding,
    })
    .from(userMemory)
    .where(eq(userMemory.userId, userId))
    .orderBy(desc(userMemory.updatedAt));

  return rows.map((r) => ({
    id: r.id,
    content: r.content,
    status: r.status,
    embedded: Array.isArray(r.embedding) && r.embedding.length > 0,
    dimensions: Array.isArray(r.embedding) ? r.embedding.length : 0,
  }));
}
