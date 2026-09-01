import { auth } from "@/auth";
import { createContent, deleteContent, getContent, updateContent } from "@/lib/db/knowledge-content-queries";
import { getDocument } from "@/lib/db/knowledge-queries";
import { assertKnowledgeWritePermission } from "@/lib/knowledge/permissions";
import { validateKnowledgeContent, logKnowledgeAction } from "@/lib/knowledge/safety";
import { reindexKnowledgeDocument } from "@/lib/knowledge/reindex";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { userId: session.user.id, email: session.user.email ?? "" };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!(await getDocument(user.userId, id))) return new Response("Not found", { status: 404 });
  return Response.json({ content: await getContent(user.userId, id) });
}

async function validateWrite(req: Request, user: { userId: string; email: string }, id: string) {
  const perm = await assertKnowledgeWritePermission(user.email);
  if (!perm.ok) return { response: Response.json({ error: perm.error }, { status: 403 }) };
  const body = await req.json().catch(() => null);
  if (typeof body?.content !== "string") return { response: new Response("content is required", { status: 400 }) };
  const safety = validateKnowledgeContent(body.content);
  if (!safety.ok) return { response: Response.json({ error: safety.error }, { status: 422 }) };
  const doc = await getDocument(user.userId, id);
  if (!doc) return { response: new Response("Not found", { status: 404 }) };
  return { body, doc };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const checked = await validateWrite(req, user, id);
  if ("response" in checked) return checked.response;
  const content = await createContent(user.userId, id, checked.body.content);
  if (!content) return new Response("Not found", { status: 404 });
  const reindexed = await reindexKnowledgeDocument(user.userId, id);
  if (!reindexed) return new Response("Could not index document", { status: 500 });
  void logKnowledgeAction({ userId: user.userId, email: user.email, action: "create_content", documentId: id, documentTitle: checked.doc.title, contentAfter: checked.body.content });
  return Response.json({ content, index: reindexed }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const checked = await validateWrite(req, user, id);
  if ("response" in checked) return checked.response;
  const existing = await getContent(user.userId, id);
  const content = existing
    ? await updateContent(user.userId, id, checked.body.content)
    : await createContent(user.userId, id, checked.body.content);
  if (!content) return new Response("Not found", { status: 404 });
  const reindexed = await reindexKnowledgeDocument(user.userId, id);
  if (!reindexed) return new Response("Could not index document", { status: 500 });
  void logKnowledgeAction({ userId: user.userId, email: user.email, action: "update_content", documentId: id, documentTitle: checked.doc.title, contentBefore: existing?.content ?? undefined, contentAfter: checked.body.content });
  return Response.json({ content, index: reindexed });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const perm = await assertKnowledgeWritePermission(user.email);
  if (!perm.ok) return Response.json({ error: perm.error }, { status: 403 });
  const { id } = await params;
  const doc = await getDocument(user.userId, id);
  const deleted = await deleteContent(user.userId, id);
  if (!deleted) return new Response("Not found", { status: 404 });
  void logKnowledgeAction({ userId: user.userId, email: user.email, action: "delete_content", documentId: id, documentTitle: doc?.title ?? id });
  return new Response(null, { status: 204 });
}
