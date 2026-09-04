import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { adminDeleteKnowledge } from "@/lib/admin/queries";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeDocument, knowledgeContent } from "@/lib/db/schema";
import { updateContent, createContent } from "@/lib/db/knowledge-content-queries";
import { reindexKnowledgeDocument } from "@/lib/knowledge/reindex";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-read:knowledge-[id]:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;
  const { id } = await params;

  const [doc] = await db
    .select()
    .from(knowledgeDocument)
    .where(eq(knowledgeDocument.id, id));
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  const [contentRow] = await db
    .select({ content: knowledgeContent.content })
    .from(knowledgeContent)
    .where(eq(knowledgeContent.documentId, id));

  return Response.json({ document: { ...doc, content: contentRow?.content ?? "" } });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;
  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;
  const { id } = await params;
  const { title, category, brainId, content, visibility } = await req.json();

  const [doc] = await db
    .select()
    .from(knowledgeDocument)
    .where(eq(knowledgeDocument.id, id));
  if (!doc) return Response.json({ error: "Not found" }, { status: 404 });

  // Update metadata.
  await db
    .update(knowledgeDocument)
    .set({
      ...(title?.trim() ? { title: title.trim() } : {}),
      category: category || null,
      brainId: brainId || null,
      ...(visibility === "global" || visibility === "private" ? { visibility } : {}),
      updatedAt: new Date(),
    })
    .where(eq(knowledgeDocument.id, id));

  // Re-chunk when content is changed.
  if (content?.trim()) {
    const text = content.trim();
    const existingContent = await db
      .select({ id: knowledgeContent.id })
      .from(knowledgeContent)
      .where(eq(knowledgeContent.documentId, id));

    if (existingContent.length > 0) {
      await updateContent(doc.userId, id, text);
    } else {
      await createContent(doc.userId, id, text);
    }

    // Use the canonical reindex path so admin writes get the same stale-index
    // race protection and best-effort embedding recovery as user writes.
    const reindexed = await reindexKnowledgeDocument(doc.userId, id);
    if (!reindexed) {
      return Response.json({ error: "Content changed while indexing; retry." }, { status: 409 });
    }
  }

  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;
  const { id } = await params;
  const ok = await adminDeleteKnowledge(id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
