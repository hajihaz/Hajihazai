import { requireAdmin } from "@/lib/admin/session";
import { getKnowledgeGaps } from "@/lib/admin/analytics";

/**
 * Phase 3 — Knowledge Gaps (admin). Surfaces unmet demand aggregated from
 * assistant-message provenance: zero-result queries, clarification queries,
 * low-confidence queries, and missing-topic suggestions — so an admin can turn
 * a real query into a new document. Read-only.
 */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const gaps = await getKnowledgeGaps().catch(() => ({
    zeroResultQueries: [], clarificationQueries: [], lowConfidenceQueries: [], missingTopicSuggestions: [],
  }));
  return Response.json({ gaps });
}
