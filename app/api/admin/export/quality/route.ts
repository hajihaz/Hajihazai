import { requireAdmin } from "@/lib/admin/session";
import { getQualityDashboard, qualityCsv } from "@/lib/admin/quality";

/** CSV export of the weekly quality dashboard (observability sprint). */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });

  const dashboard = await getQualityDashboard().catch(() => null);
  if (!dashboard) return new Response("Failed to load quality data", { status: 500 });

  return new Response(qualityCsv(dashboard), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="quality-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
