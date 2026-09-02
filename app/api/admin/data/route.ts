import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import {
  adminListUsers,
  adminListProjects,
  adminListDocuments,
} from "@/lib/admin/queries";

/**
 * Admin read-only views: users, projects, uploaded documents. Pass ?view=
 * users|projects|documents (defaults to a combined summary).
 */
export async function GET(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const readLimited = await rateLimitResponse(`admin-read:${sess.adminId}`, 60, 60_000);
  if (readLimited) return readLimited;

  const view = new URL(req.url).searchParams.get("view");
  if (view === "users") return Response.json({ users: await adminListUsers() });
  if (view === "projects") return Response.json({ projects: await adminListProjects() });
  if (view === "documents") return Response.json({ documents: await adminListDocuments() });

  const [users, projects, documents] = await Promise.all([
    adminListUsers(),
    adminListProjects(),
    adminListDocuments(),
  ]);
  return Response.json({ users, projects, documents });
}
