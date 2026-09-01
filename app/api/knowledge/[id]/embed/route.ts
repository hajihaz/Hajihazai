import { auth } from "@/auth";
import { getDocument } from "@/lib/db/knowledge-queries";
import { getChunkEmbeddingStatus } from "@/lib/db/knowledge-embedding-queries";
import { embedDocumentChunks } from "@/lib/knowledge/embed-chunks";
import { rateLimitAsync } from "@/lib/ratelimit";
import { assertKnowledgeWritePermission } from "@/lib/knowledge/permissions";

/** Generate and store embeddings for all of a document's chunks. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const perm = await assertKnowledgeWritePermission(session.user.email);
  if (!perm.ok) {
    return Response.json({ error: perm.error }, { status: 403 });
  }
  const { id } = await params;

  const limited = await rateLimitAsync(`kb-embed:${session.user.id}`, 5, 60_000);
  if (!limited.ok) {
    return new Response("Too many embedding requests. Please wait.", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((limited.retryAfterMs ?? 1000) / 1000)),
      },
    });
  }

  const result = await embedDocumentChunks(session.user.id, id);
  if (result === null) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json(result, { status: 201 });
}

/** Embedding status: chunk count, embedded count, dimensions. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  if (!(await getDocument(session.user.id, id))) {
    return new Response("Not found", { status: 404 });
  }

  const status = await getChunkEmbeddingStatus(session.user.id, id);
  return Response.json({
    total: status?.total ?? 0,
    embedded: status?.embedded ?? 0,
    dimensions: 768,
  });
}
