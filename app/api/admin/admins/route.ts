import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { listAdmins, createAdmin, recordAdminAuditEvent } from "@/lib/admin/queries";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { validateUsername } from "@/lib/onboarding/validate";

export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-read:admins:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;
  return Response.json({ admins: await listAdmins() });
}

export async function POST(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  const usernameResult = validateUsername(body?.username);
  if (!usernameResult.ok) return Response.json({ error: usernameResult.error }, { status: 400 });
  const username = usernameResult.value;
  const pw = validatePassword(body?.password);
  if (!pw.ok) return Response.json({ error: pw.error }, { status: 400 });

  const result = await createAdmin({
    username,
    passwordHash: await hashPassword(pw.value),
    createdBy: sess.adminId,
  });
  if (!result.ok) {
    return Response.json({ error: "That admin username is taken" }, { status: 409 });
  }
  await recordAdminAuditEvent({
    adminId: sess.adminId,
    action: "admin_created",
    targetType: "admin",
    targetId: result.id,
  });
  return Response.json({ ok: true, id: result.id }, { status: 201 });
}
