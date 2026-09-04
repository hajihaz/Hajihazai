import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { adminListKnowledge, adminListKnowledgeWithBrain } from "@/lib/admin/queries";
import { ingestText } from "@/lib/knowledge/ingest";

export async function GET(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-read:knowledge:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const withBrain = url.searchParams.get("withBrain") === "1";
  const knowledge = withBrain
    ? await adminListKnowledgeWithBrain()
    : await adminListKnowledge();
  return Response.json({ knowledge });
}

export async function POST(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const { userId, projectId, brainId, title, category, content, visibility } = await req.json();

  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }
  if (!title?.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }
  if (!content?.trim()) {
    return Response.json({ error: "content is required" }, { status: 400 });
  }

  const result = await ingestText(userId, {
    title: title.trim(),
    content: content.trim(),
    projectId: projectId || null,
    category: category || null,
    brainId: brainId || null,
    visibility: visibility === "global" ? "global" : "private",
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json({ ok: true, documentId: result.documentId, chunks: result.chunks });
}
