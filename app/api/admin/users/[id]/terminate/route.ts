import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { adminGetUserDetail, adminTerminateUser } from "@/lib/admin/queries";
import { syncEventToSheets } from "@/lib/google-sheets";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const user = await adminGetUserDetail(id);
  if (!user) return Response.json({ error: "User not found" }, { status: 404 });
  if (!user.email) return Response.json({ error: "User has no email" }, { status: 400 });

  await adminTerminateUser(id, user.email);
  syncEventToSheets({ email: user.email, eventType: "account_terminated", detail: `by admin ${sess.adminId}` });
  return Response.json({ ok: true });
}
