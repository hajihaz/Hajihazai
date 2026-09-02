import { and, eq, or, lte, gt, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { userMemory } from "@/lib/db/schema";
import { rankMemories } from "./ranking";

/**
 * Memory retrieval — ACTIVE memories only (pending + deleted are excluded).
 * Keyword search + type/recency ranking. No embeddings / vector search.
 * Does not inject into prompts or touch chat.
 */

export async function getActiveMemories(userId: string) {
  // Retrieval/ranking never needs the 768-dim vector or management-only fields.
  // Avoid selecting the embedding for every active memory on each chat request;
  // semanticSearch already reads vectors directly through pgvector.
  const now = new Date();
  return db
    .select({
      id: userMemory.id,
      type: userMemory.type,
      content: userMemory.content,
      status: userMemory.status,
      validFrom: userMemory.validFrom,
      validUntil: userMemory.validUntil,
      updatedAt: userMemory.updatedAt,
    })
    .from(userMemory)
    .where(and(
      eq(userMemory.userId, userId),
      eq(userMemory.status, "active"),
      lte(userMemory.validFrom, now),
      or(isNull(userMemory.validUntil), gt(userMemory.validUntil, now)),
    ));
}

export async function searchMemories(userId: string, q?: string) {
  const active = await getActiveMemories(userId);
  return rankMemories(active, q, Date.now());
}

/** Debug variant: also reports what was excluded and why. */
export async function searchWithDiagnostics(userId: string, q?: string) {
  const all = await db
    .select()
    .from(userMemory)
    .where(eq(userMemory.userId, userId));

  const now = new Date();
  const active = all.filter(
    (m) =>
      m.status === "active" &&
      m.validFrom <= now &&
      (m.validUntil === null || m.validUntil > now),
  );
  const results = rankMemories(active, q, now.getTime());
  const resultIds = new Set(results.map((r) => r.id));

  const excluded = all
    .filter((m) => !resultIds.has(m.id))
    .map((m) => {
      let reason: string;
      if (m.status !== "active") reason = m.status;
      else if (m.validFrom > now) reason = "not-yet-valid";
      else if (m.validUntil !== null && m.validUntil <= now) reason = "expired";
      else reason = "no-match";
      return {
        id: m.id,
        type: m.type,
        content: m.content,
        status: m.status,
        reason,
      };
    });

  return { query: q ?? "", results, excluded };
}
