import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import {
  adminListNotifications,
  adminCreateNotification,
} from "@/lib/admin/queries";

export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-read:notifications:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const rows = await adminListNotifications();
  return Response.json({ notifications: rows });
}

export async function POST(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const body = await req.json().catch(() => ({}));
  const title = body.title?.trim();
  const message = body.message?.trim();
  const targetType = body.targetType === "specific" ? "specific" : "all";

  if (!title || !message) {
    return Response.json({ error: "title and message are required" }, { status: 400 });
  }

  const notif = await adminCreateNotification({
    title,
    message,
    targetType,
    createdBy: sess.adminId,
  });

  return Response.json({ notification: notif }, { status: 201 });
}
