import { auth } from "@/auth";
import { deleteConversation, renameConversation, getConversation } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

const TITLE_MAX = 120;

export const dynamic = "force-dynamic";

/** Rename a conversation: { title }. Ownership-enforced. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const limited = await rateLimitResponse(`conversation-mutation:${session.user.id}`, 60, 60_000);
  if (limited) return limited;
  const { id } = await params;

  const oversized = rejectOversizedBody(req, 65536);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  if (typeof body?.pinned === "boolean" || typeof body?.intelligenceLevel === "string") {
    const current = await getConversation(session.user.id, id);
    if (!current) return new Response("Not found", { status: 404 });
    const level = typeof body?.intelligenceLevel === "string" ? body.intelligenceLevel : undefined;
    if (level && !["low","medium","high","max"].includes(level)) return new Response("invalid intelligenceLevel", { status: 400 });
    const [updated] = await db.update(conversations).set({ ...(typeof body?.pinned === "boolean" ? { pinned: body.pinned } : {}), ...(level ? { intelligenceLevel: level } : {}), updatedAt: new Date() }).where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id))).returning({ id: conversations.id, pinned: conversations.pinned, intelligenceLevel: conversations.intelligenceLevel });
    return Response.json(updated);
  }
  if (typeof body?.archived === "boolean") {
    const current = await getConversation(session.user.id, id);
    if (!current) return new Response("Not found", { status: 404 });
    const [updated] = await db.update(conversations).set({ archived: body.archived, updatedAt: new Date() }).where(and(eq(conversations.id, id), eq(conversations.userId, session.user.id))).returning({ id: conversations.id, archived: conversations.archived });
    return Response.json(updated);
  }
  const raw = typeof body?.title === "string" ? body.title.trim() : "";
  if (!raw) return new Response("title is required", { status: 400 });
  const title = raw.slice(0, TITLE_MAX);

  const updated = await renameConversation(session.user.id, id, title);
  if (!updated) return new Response("Not found", { status: 404 });
  return Response.json({ id: updated.id, title: updated.title });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const limited = await rateLimitResponse(`conversation-mutation:${session.user.id}`, 60, 60_000);
  if (limited) return limited;
  const { id } = await params;
  await deleteConversation(session.user.id, id);
  return new Response(null, { status: 204 });
}
