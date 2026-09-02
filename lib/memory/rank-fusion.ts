import type { SemanticHit } from "./semantic-search";
import type { UserMemory } from "@/lib/db/schema";

type KeywordHit = Pick<UserMemory, "id" | "type" | "content" | "updatedAt"> & { score: number };

/**
 * Blend semantic and keyword memory retrieval by reciprocal-rank fusion.
 * Raw similarity and keyword scores are intentionally not mixed directly:
 * their scales are incomparable. Each channel contributes only its rank.
 */
export function fuseMemoryRanks(
  semanticHits: SemanticHit[],
  keywordHits: KeywordHit[],
): Array<{ id: string; type: string; content: string; similarity?: number }> {
  const RRF_K = 60;
  // Keyword evidence gets a 2x channel weight so exact names/brands
  // can rescue a semantically plausible but less precise memory.
  const KEYWORD_WEIGHT = 2;
  const scores = new Map<string, number>();
  const hits = new Map<string, { id: string; type: string; content: string; similarity?: number }>();
  const firstRank = new Map<string, number>();

  for (let i = 0; i < semanticHits.length; i++) {
    const hit = semanticHits[i];
    hits.set(hit.id, hit);
    scores.set(hit.id, (scores.get(hit.id) ?? 0) + 1 / (RRF_K + i + 1));
    if (!firstRank.has(hit.id)) firstRank.set(hit.id, i);
  }

  for (let i = 0; i < keywordHits.length; i++) {
    const hit = keywordHits[i];
    if (!hits.has(hit.id)) {
      hits.set(hit.id, { id: hit.id, type: hit.type, content: hit.content });
    }
    scores.set(
      hit.id,
      (scores.get(hit.id) ?? 0) + KEYWORD_WEIGHT / (RRF_K + i + 1),
    );
    if (!firstRank.has(hit.id)) firstRank.set(hit.id, semanticHits.length + i);
  }

  return [...hits.values()].sort((a, b) => {
    const scoreDiff = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
    if (Math.abs(scoreDiff) > 1e-12) return scoreDiff;
    return (firstRank.get(a.id) ?? 0) - (firstRank.get(b.id) ?? 0);
  });
}
