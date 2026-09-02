import { and, cosineDistance, desc, eq, gt, isNotNull, lte, or, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { userMemory } from "@/lib/db/schema";
import { embed } from "@/lib/ai/embeddings/router";

/**
 * Standalone semantic (vector) retrieval over memory embeddings.
 * - Embeds the query with the Phase 6.0 embedding router.
 * - Ranks ACTIVE memories by cosine similarity (pgvector).
 * - Applies a similarity threshold; results are sorted descending.
 *
 * This is a standalone service: it does NOT inject into prompts, does NOT
 * touch the chat route, and does NOT replace keyword retrieval.
 */
// Calibrated for nomic-embed-text on short atomic memories, which score lower
// than long documents. 0.70 dropped essentially every match (memories score
// ~0.55–0.65); 0.62 admits genuine semantic matches while the keyword tier +
// type ranking + char budget keep the generic identity memory from dominating.
export const DEFAULT_SIMILARITY_THRESHOLD = 0.62;

export interface SemanticHit {
  id: string;
  type: string;
  content: string;
  similarity: number;
}

export async function semanticSearch(
  userId: string,
  query: string,
  limit = 10,
  threshold = DEFAULT_SIMILARITY_THRESHOLD,
): Promise<SemanticHit[]> {
  if (!query || !query.trim()) return [];

  const { embedding: queryVector } = await embed(query);

  // cosine similarity = 1 - cosine distance
  const similarity = sql<number>`1 - (${cosineDistance(userMemory.embedding, queryVector)})`;

  const rows = await db
    .select({
      id: userMemory.id,
      type: userMemory.type,
      content: userMemory.content,
      similarity,
    })
    .from(userMemory)
    .where(
      and(
        eq(userMemory.userId, userId), // user isolation
        eq(userMemory.status, "active"), // active only (excludes pending/deleted)
        lte(userMemory.validFrom, new Date()),
        or(isNull(userMemory.validUntil), gt(userMemory.validUntil, new Date())),
        isNotNull(userMemory.embedding),
        gt(similarity, threshold), // similarity threshold
      ),
    )
    .orderBy(desc(similarity))
    .limit(limit);

  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
}
