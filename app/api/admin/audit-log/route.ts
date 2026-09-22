import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { listKnowledgeAuditLog, listAdminAuditLog } from "@/lib/admin/queries";

export async function GET(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const readLimited = await rateLimitResponse(`admin-read:audit-log:${sess.adminId}`, 60, 60_000);
  if (readLimited) return readLimited;

  const requested = Number(new URL(req.url).searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requested) ? Math.min(200, Math.max(1, Math.floor(requested))) : 50;
  const [entries, securityEntries] = await Promise.all([
    listKnowledgeAuditLog(limit),
    listAdminAuditLog(limit),
  ]);
  return Response.json({ entries, securityEntries });
}
