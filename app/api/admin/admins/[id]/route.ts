import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { deleteAdmin, resetAdminPassword, countAdmins, recordAdminAuditEvent } from "@/lib/admin/queries";
import { hashPassword, validatePassword } from "@/lib/auth/password";

/** Reset an admin's password. */
export async function PATCH(
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

  const body = await req.json().catch(() => null);
  const pw = validatePassword(body?.password);
  if (!pw.ok) return Response.json({ error: pw.error }, { status: 400 });

  const ok = await resetAdminPassword(id, await hashPassword(pw.value));
  if (!ok) return new Response("Not found", { status: 404 });
  await recordAdminAuditEvent({
    adminId: sess.adminId,
    action: "admin_password_reset",
    targetType: "admin",
    targetId: id,
  });
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;
  const { id } = await params;

  if (id === sess.adminId) {
    return Response.json({ error: "Cannot delete the currently signed-in admin" }, { status: 409 });
  }

  // Never allow deleting the last admin (would lock everyone out).
  if ((await countAdmins()) <= 1) {
    return Response.json({ error: "Cannot delete the last admin" }, { status: 409 });
  }
  const ok = await deleteAdmin(id);
  if (!ok) return new Response("Not found", { status: 404 });
  await recordAdminAuditEvent({
    adminId: sess.adminId,
    action: "admin_deleted",
    targetType: "admin",
    targetId: id,
  });
  return new Response(null, { status: 204 });
}
