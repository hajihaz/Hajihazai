import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { adminListUsersPage } from "@/lib/admin/queries";

export async function GET(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const readLimited = await rateLimitResponse(`admin-read:users:${sess.adminId}`, 60, 60_000);
  if (readLimited) return readLimited;

  const url = new URL(req.url);
  const search = url.searchParams.get("search") ?? undefined;
  const pageRaw = Number(url.searchParams.get("page") ?? "1");
  const limitRaw = Number(url.searchParams.get("limit") ?? "20");
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 20;

  const result = await adminListUsersPage({ search, page, limit });
  return Response.json(result);
}
