import { getAdminSession, destroyAdminSession } from "@/lib/admin/session";
import { recordAdminAuditEvent } from "@/lib/admin/queries";
import { getClientIp, rateLimitIdentity } from "@/lib/auth/request";
import { rateLimitResponse } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const limited = await rateLimitResponse(rateLimitIdentity(req, "admin-logout"), 30, 60_000);
  if (limited) return limited;
  const sess = await getAdminSession();
  await destroyAdminSession();
  if (sess) {
    await recordAdminAuditEvent({
      adminId: sess.adminId,
      action: "logout",
      targetType: "admin",
      targetId: sess.adminId,
      ipAddress: getClientIp(req),
    });
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
