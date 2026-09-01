import { auth } from "@/auth";
import { getContent } from "@/lib/db/knowledge-content-queries";
import { getDocument } from "@/lib/db/knowledge-queries";
import { createChunks } from "@/lib/db/knowledge-chunk-queries";
import { chunkDocument } from "@/lib/knowledge/chunk";
import { assertKnowledgeWritePermission } from "@/lib/knowledge/permissions";
import { rateLimitResponse } from "@/lib/ratelimit";

/** Load the document's content, chunk it, and persist the chunks. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const limited = await rateLimitResponse(`kb-chunk:${session.user.id}`, 30, 60_000);
  if (limited) return limited;

  const perm = await assertKnowledgeWritePermission(session.user.email);
  if (!perm.ok) {
    return Response.json({ error: perm.error }, { status: 403 });
  }
  const { id } = await params;

  if (!(await getDocument(session.user.id, id))) {
    return new Response("Not found", { status: 404 });
  }

  const content = await getContent(session.user.id, id);
  if (!content?.content?.trim()) {
    return new Response("Document has no content to chunk", { status: 400 });
  }

  const chunks = chunkDocument(content.content);
  const saved = await createChunks(session.user.id, id, chunks);
  if (saved === null) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json({ count: saved.length }, { status: 201 });
}
