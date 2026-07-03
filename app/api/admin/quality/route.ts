import { requireAdmin } from "@/lib/admin/session";
import { getQualityDashboard } from "@/lib/admin/quality";

/**
 * Weekly quality dashboard (observability sprint) — helpful %, clarification %,
 * zero-result %, latency, disliked queries, missing knowledge areas, brain
 * usage; grouped per ISO week over the last 8 weeks. Read-only.
 */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const dashboard = await getQualityDashboard().catch(() => null);
  if (!dashboard) return new Response("Failed to load quality data", { status: 500 });
  return Response.json({ dashboard });
}
