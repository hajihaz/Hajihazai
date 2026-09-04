import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { listKnowledgeAuditLog } from "@/lib/admin/queries";

export async function GET(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const readLimited = await rateLimitResponse(`admin-read:audit-log:${sess.adminId}`, 60, 60_000);
  if (readLimited) return readLimited;

  const limit = Math.min(200, Number(new URL(req.url).searchParams.get("limit") ?? "50"));
  const entries = await listKnowledgeAuditLog(limit);
  return Response.json({ entries });
}
