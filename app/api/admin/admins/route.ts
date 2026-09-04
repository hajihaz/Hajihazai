import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { listAdmins, createAdmin } from "@/lib/admin/queries";
import { hashPassword, validatePassword } from "@/lib/auth/password";

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
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (username.length < 3) {
    return Response.json({ error: "Username must be at least 3 characters" }, { status: 400 });
  }
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
  return Response.json({ ok: true, id: result.id }, { status: 201 });
}
