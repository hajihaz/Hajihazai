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
  return db
    .select()
    .from(userMemory)
    .where(and(
      eq(userMemory.userId, userId),
      eq(userMemory.status, "active"),
      lte(userMemory.validFrom, new Date()),
      or(isNull(userMemory.validUntil), gt(userMemory.validUntil, new Date())),
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

  const active = all.filter((m) => m.status === "active");
  const results = rankMemories(active, q, Date.now());
  const resultIds = new Set(results.map((r) => r.id));

  const excluded = all
    .filter((m) => !resultIds.has(m.id))
    .map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      status: m.status,
      // pending/deleted → status; otherwise an active row that didn't match q.
      reason: m.status !== "active" ? m.status : "no-match",
    }));

  return { query: q ?? "", results, excluded };
}
