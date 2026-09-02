import type { DocumentSearchHit } from "./semantic-search";

function titleScore(title: string, query: string): number {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  if (t === q || t.includes(q)) return 100;
  const toks = q.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 || /^\d+$/.test(w));
  let hits = 0;
  for (const tok of toks) if (t.includes(tok)) hits++;
  return hits;
}

/** Blend semantic and keyword retrieval ranks using reciprocal-rank fusion. */
export function fuseKnowledgeRanks(
  semanticHits: DocumentSearchHit[],
  keywordHits: DocumentSearchHit[],
  query: string,
): DocumentSearchHit[] {
  const RRF_K = 60;
  const scores = new Map<string, number>();
  const hits = new Map<string, DocumentSearchHit>();
  const firstRank = new Map<string, number>();

  for (let i = 0; i < semanticHits.length; i++) {
    const h = semanticHits[i];
    hits.set(h.chunkId, h);
    scores.set(h.chunkId, (scores.get(h.chunkId) ?? 0) + 1 / (RRF_K + i + 1));
    if (!firstRank.has(h.chunkId)) firstRank.set(h.chunkId, i);
  }
  for (let i = 0; i < keywordHits.length; i++) {
    const h = keywordHits[i];
    if (!hits.has(h.chunkId)) hits.set(h.chunkId, h);
    scores.set(h.chunkId, (scores.get(h.chunkId) ?? 0) + 1 / (RRF_K + i + 1));
    if (!firstRank.has(h.chunkId)) firstRank.set(h.chunkId, semanticHits.length + i);
  }

  const q = query.trim();
  return [...hits.values()].sort((a, b) => {
    const aScore = (scores.get(a.chunkId) ?? 0) + (titleScore(a.title, q) > 0 ? 0.0005 : 0);
    const bScore = (scores.get(b.chunkId) ?? 0) + (titleScore(b.title, q) > 0 ? 0.0005 : 0);
    if (Math.abs(bScore - aScore) > 1e-9) return bScore - aScore;
    return (firstRank.get(a.chunkId) ?? 0) - (firstRank.get(b.chunkId) ?? 0);
  });
}
