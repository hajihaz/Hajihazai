import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { adminSuspendUser, adminRestoreUser, adminRevokeUserSessions, adminGetUserDetail, recordAdminAuditEvent } from "@/lib/admin/queries";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const body = await req.json().catch(() => ({}));
  const suspend = body.suspend !== false;
  const user = await adminGetUserDetail(id);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });

  if (suspend) {
    await adminSuspendUser(id);
    // Revoke active sessions so the effect is immediate
    await adminRevokeUserSessions(id).catch(() => null);
  } else {
    await adminRestoreUser(id);
  }
  await recordAdminAuditEvent({ adminId: sess.adminId, action: suspend ? "user_suspended" : "user_restored", targetType: "user", targetId: id });

  return Response.json({ ok: true, suspended: suspend });
}
