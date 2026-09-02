import { auth } from "@/auth";
import { rateLimitResponse } from "@/lib/ratelimit";
import { getConversation, listMessages } from "@/lib/db/queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const readLimited = await rateLimitResponse(`conversation-messages-read:${session.user.id}`, 120, 60_000);
  if (readLimited) return readLimited;


  // Ownership guard before returning any messages.
  const convo = await getConversation(session.user.id, id);
  if (!convo) {
    return new Response("Not found", { status: 404 });
  }

  const rows = await listMessages(id);
  return Response.json({
    messages: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      modelId: m.modelId,
    })),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
