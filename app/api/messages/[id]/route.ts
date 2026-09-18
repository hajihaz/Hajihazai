import { auth } from "@/auth";
import { deleteMessage, updateOwnedMessage, deleteMessagesAfter } from "@/lib/db/queries";
import { rejectOversizedBody } from "@/lib/auth/request";
import { rateLimitResponse } from "@/lib/ratelimit";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const limited = await rateLimitResponse(`message-delete:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const ok = await deleteMessage(session.user.id, id);
  if (!ok) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`message-edit:${session.user.id}`, 30, 60_000);
  if (limited) return limited;
  const oversized = rejectOversizedBody(req, 32 * 1024);
  if (oversized) return oversized;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content || content.length > 10_000) return new Response("Invalid content", { status: 400 });
  const updated = await updateOwnedMessage(session.user.id, id, content);
  if (!updated) return new Response("Not found", { status: 404 });
  await deleteMessagesAfter(session.user.id, id);
  return Response.json({ id: updated.id, content: updated.content });
}
