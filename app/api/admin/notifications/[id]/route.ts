import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import {
  adminGetNotification,
  adminSendNotification,
  adminDeleteNotification,
} from "@/lib/admin/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-read:notifications-[id]:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const notif = await adminGetNotification(id);
  if (!notif) return new Response("Not found", { status: 404 });
  return Response.json({ notification: notif });
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
  await adminDeleteNotification(id);
  return new Response(null, { status: 204 });
}

// POST /api/admin/notifications/[id] — send the notification
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  try {
    await adminSendNotification(id);
    return Response.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return Response.json({ error: msg }, { status: 400 });
  }
}
