import { and, eq, gt, ilike, lte, or, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { userMemory } from "@/lib/db/schema";
import { rankMemories, significantTokens } from "./ranking";

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

/**
 * Fetch only keyword candidates before doing the exact token-boundary ranking in
 * application code. This preserves ranking semantics while avoiding transfer of
 * every active memory for ordinary query searches.
 */
async function getKeywordCandidates(userId: string, q: string) {
  const tokens = significantTokens(q);
  if (tokens.length === 0) return [];

  const variants = new Set(tokens);
  for (const token of tokens) {
    if (token.length > 4 && token.endsWith("es")) variants.add(token.slice(0, -2));
    if (token.length > 3 && token.endsWith("s")) variants.add(token.slice(0, -1));
  }

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
      or(...[...variants].map((token) => ilike(userMemory.content, `%${token}%`))),
    ));
}

export async function searchMemories(userId: string, q?: string) {
  const now = Date.now();
  if (!q?.trim()) {
    const active = await getActiveMemories(userId);
    return rankMemories(active, q, now);
  }
  const candidates = await getKeywordCandidates(userId, q);
  return rankMemories(candidates, q, now);
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
