import { requireAdmin } from "@/lib/admin/session";
import { routeToBrain, CONFIDENCE_THRESHOLD } from "@/lib/ai/brain-router";
import { detectMultiBrainScope } from "@/lib/ai/multi-brain";
import { shouldRetrieve } from "@/lib/ai/should-retrieve";
import { getBrainBySlug } from "@/lib/db/brain-queries";
import { semanticDocumentSearch, DEFAULT_DOC_SIMILARITY_THRESHOLD } from "@/lib/knowledge/semantic-search";
import { keywordDocumentSearch } from "@/lib/knowledge/keyword-search";
import { db } from "@/lib/db";
import { knowledgeDocument } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

/**
 * Phase 4 — Query Tester (admin, READ-ONLY, no chat generation).
 * Runs the exact production routing + retrieval decision path for a query and
 * returns the internals: routed brain, confidence, matched keywords, the
 * clarification decision, and the semantic vs keyword retrieval hits with scores.
 * Reuses the live router/retrieval — nothing is rewritten.
 */
export async function POST(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });

  const { query } = await req.json().catch(() => ({}));
  if (typeof query !== "string" || !query.trim()) {
    return new Response("Bad request", { status: 400 });
  }
  const q = query.trim();

  // Routing decision (identical to the chat route's smart-mode logic).
  const route = routeToBrain(q);
  const multiBrains = detectMultiBrainScope(q);
  const isMulti = multiBrains.length >= 2;
  const wantRetrieval = shouldRetrieve(q);
  const smartUnrouted = (route.brain ?? null) === null;
  const clarify = smartUnrouted && !isMulti && wantRetrieval;

  // A userId that can see global docs (all curated brain docs are global).
  const [owner] = await db
    .select({ uid: knowledgeDocument.userId })
    .from(knowledgeDocument)
    .where(eq(knowledgeDocument.status, "active"))
    .groupBy(knowledgeDocument.userId)
    .orderBy(sql`count(*) desc`)
    .limit(1);
  const userId = owner?.uid ?? "";

  const slugs = isMulti ? multiBrains : route.brain ? [route.brain] : [];
  const perBrain: Array<{ brain: string; semantic: Array<{ title: string; score: number }>; keyword: Array<{ title: string; score: number }> }> = [];
  for (const slug of slugs) {
    const b = await getBrainBySlug(slug).catch(() => null);
    if (!b) continue;
    const [sem, kw] = await Promise.all([
      semanticDocumentSearch(userId, q, 5, DEFAULT_DOC_SIMILARITY_THRESHOLD, { brainId: b.id, projectId: null }).catch(() => []),
      keywordDocumentSearch(userId, q, { brainId: b.id, projectId: null, limit: 5 }).catch(() => []),
    ]);
    perBrain.push({
      brain: slug,
      semantic: [...new Map(sem.map((h) => [h.title, Number(h.similarity.toFixed(3))])).entries()].map(([title, score]) => ({ title, score })),
      keyword: [...new Map(kw.map((h: { title: string; score?: number }) => [h.title, Number((h.score ?? 0))])).entries()].map(([title, score]) => ({ title, score })),
    });
  }

  return Response.json({
    query: q,
    routedBrain: route.brain,
    confidence: route.confidence,
    confidenceThreshold: CONFIDENCE_THRESHOLD,
    matchedKeywords: route.matchedKeywords,
    reason: route.reason,
    multiBrains: isMulti ? multiBrains : null,
    wantRetrieval,
    clarificationDecision: clarify ? "clarify (ambiguous / low-confidence)" : "no",
    semanticThreshold: DEFAULT_DOC_SIMILARITY_THRESHOLD,
    retrieval: perBrain,
  });
}
