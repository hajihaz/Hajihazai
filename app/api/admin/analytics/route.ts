import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { getAdminAnalyticsV2 } from "@/lib/admin/queries";

export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const readLimited = await rateLimitResponse(`admin-read:${sess.adminId}`, 60, 60_000);
  if (readLimited) return readLimited;

  const analytics = await getAdminAnalyticsV2();
  return Response.json({ analytics });
}
