import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { validatePassword } from "@/lib/auth/password";
import { adminResetUserPassword, recordAdminAuditEvent } from "@/lib/admin/queries";

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
  const pw = validatePassword(body?.password);
  if (!pw.ok) return Response.json({ error: pw.error }, { status: 400 });

  const ok = await adminResetUserPassword(id, pw.value);
  if (!ok) return Response.json({ error: "User not found" }, { status: 404 });
  await recordAdminAuditEvent({
    adminId: sess.adminId,
    action: "user_password_reset",
    targetType: "user",
    targetId: id,
  });
  return Response.json({ ok: true });
}
