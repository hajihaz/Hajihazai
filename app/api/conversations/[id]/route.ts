import { auth } from "@/auth";
import { deleteConversation, renameConversation } from "@/lib/db/queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

const TITLE_MAX = 120;

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
