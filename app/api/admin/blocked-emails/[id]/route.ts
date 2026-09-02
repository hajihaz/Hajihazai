import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { removeBlockedEmail } from "@/lib/admin/queries";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const ok = await removeBlockedEmail(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
