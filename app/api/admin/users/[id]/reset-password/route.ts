import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { adminResetUserPassword } from "@/lib/admin/queries";

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
  const newPassword = typeof body.password === "string" ? body.password.trim() : "";

  if (!newPassword || newPassword.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const ok = await adminResetUserPassword(id, newPassword);
  if (!ok) return Response.json({ error: "User not found" }, { status: 404 });
  return Response.json({ ok: true });
}
