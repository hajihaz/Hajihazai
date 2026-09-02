import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import {
  isMaintenanceMode,
  setMaintenanceMode,
  getMaintenanceMessage,
  setMaintenanceMessage,
} from "@/lib/system-settings";

export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const [enabled, message] = await Promise.all([
    isMaintenanceMode(),
    getMaintenanceMessage(),
  ]);
  return Response.json({ enabled, message });
}

export async function POST(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const body = await req.json().catch(() => ({}));
  const enabled = body.enabled === true;
  const message = typeof body.message === "string" ? body.message.trim() : null;

  await setMaintenanceMode(enabled);
  if (message) await setMaintenanceMessage(message);

  return Response.json({ ok: true, enabled });
}
