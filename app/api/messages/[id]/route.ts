import { auth } from "@/auth";
import { deleteMessage } from "@/lib/db/queries";
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
