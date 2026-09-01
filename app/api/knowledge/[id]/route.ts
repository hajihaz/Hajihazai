import { auth } from "@/auth";
import { deleteDocument, getDocument } from "@/lib/db/knowledge-queries";
import { assertKnowledgeWritePermission } from "@/lib/knowledge/permissions";
import { rateLimitResponse } from "@/lib/ratelimit";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  const document = await getDocument(session.user.id, id);
  if (!document) {
    return new Response("Not found", { status: 404 });
  }
  return Response.json({ document }, { headers: PRIVATE_NO_STORE });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const limited = await rateLimitResponse(`knowledge-delete:${session.user.id}`, 30, 60_000);
  if (limited) return limited;

  const perm = await assertKnowledgeWritePermission(session.user.email);
  if (!perm.ok) {
    return Response.json({ error: perm.error }, { status: 403 });
  }
  const { id } = await params;

  const deleted = await deleteDocument(session.user.id, id);
  if (!deleted) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(null, { status: 204 });
}
