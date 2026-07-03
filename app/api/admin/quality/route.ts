import { requireAdmin } from "@/lib/admin/session";
import { loadRetrievalEvents } from "@/lib/admin/analytics";
import { computeQualityDashboard } from "@/lib/admin/quality";
import { computeKnowledgeBacklog, recommendContent, analyzeFeedback } from "@/lib/admin/insights";
import { getBrainHealth } from "@/lib/admin/brain-health";

/**
 * Quality dashboard (observe-and-improve): weekly metrics + quality score,
 * auto knowledge backlog, content recommendations, thumbs-down categorization,
 * and per-brain health — all derived from one event load. Read-only.
 */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });

  const events = await loadRetrievalEvents(56, 20_000).catch(() => null);
  if (!events) return new Response("Failed to load quality data", { status: 500 });

  const [brainHealth] = await Promise.all([getBrainHealth(events).catch(() => [])]);
  return Response.json({
    dashboard: computeQualityDashboard(events, 56),
    backlog: computeKnowledgeBacklog(events),
    recommendations: recommendContent(events),
    feedbackAnalysis: analyzeFeedback(events),
    brainHealth,
  });
}
