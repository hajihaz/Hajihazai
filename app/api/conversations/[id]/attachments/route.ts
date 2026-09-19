import { auth } from "@/auth";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversationAttachments, conversations, knowledgeDocument } from "@/lib/db/schema";
import { rateLimitResponse } from "@/lib/ratelimit";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const rows = await db.select({ id: conversationAttachments.id, documentId: knowledgeDocument.id, title: knowledgeDocument.title, originalName: knowledgeDocument.originalName, mimeType: knowledgeDocument.mimeType, byteSize: knowledgeDocument.byteSize, sourceType: knowledgeDocument.sourceType, createdAt: conversationAttachments.createdAt })
    .from(conversationAttachments).innerJoin(knowledgeDocument, eq(conversationAttachments.documentId, knowledgeDocument.id)).innerJoin(conversations, eq(conversationAttachments.conversationId, conversations.id))
    .where(and(eq(conversationAttachments.conversationId, id), eq(conversationAttachments.userId, session.user.id), eq(conversations.userId, session.user.id))).orderBy(desc(conversationAttachments.createdAt));
  return Response.json({ attachments: rows }, { headers: NO_STORE });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`conversation-attachments:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const documentId = new URL(req.url).searchParams.get("documentId")?.trim() ?? "";
  if (!documentId) return Response.json({ error: "documentId is required" }, { status: 400 });

  const [deleted] = await db
    .delete(conversationAttachments)
    .where(
      and(
        eq(conversationAttachments.conversationId, id),
        eq(conversationAttachments.documentId, documentId),
        eq(conversationAttachments.userId, session.user.id),
      ),
    )
    .returning({ id: conversationAttachments.id });

  return deleted ? new Response(null, { status: 204 }) : new Response("Not found", { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`conversation-attachments:${session.user.id}`, 60, 60_000); if (limited) return limited;
  const { id } = await params; const body = await req.json().catch(() => null); const documentId = typeof body?.documentId === "string" ? body.documentId : "";
  if (!documentId) return Response.json({ error: "documentId is required" }, { status: 400 });
  const [owned] = await db.select({ id: knowledgeDocument.id }).from(knowledgeDocument).where(and(eq(knowledgeDocument.id, documentId), eq(knowledgeDocument.userId, session.user.id)));
  const [conversation] = await db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id)));
  if (!owned || !conversation) return new Response("Not found", { status: 404 });
  const [row] = await db.insert(conversationAttachments).values({ conversationId: id, documentId, userId: session.user.id }).onConflictDoNothing().returning();
  return Response.json({ attachment: row ?? null }, { status: 201 });
}
