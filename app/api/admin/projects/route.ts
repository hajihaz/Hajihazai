import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { adminListProjectsForPicker } from "@/lib/admin/queries";

/** Minimal project list for UI dropdowns (id, name, userId only). */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const readLimited = await rateLimitResponse(`admin-read:${sess.adminId}`, 60, 60_000);
  if (readLimited) return readLimited;
  const projects = await adminListProjectsForPicker();
  return Response.json({ projects });
}
