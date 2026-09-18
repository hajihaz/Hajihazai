import { auth } from "@/auth";
import { addMessage, createConversation, getConversation, listMessages } from "@/lib/db/queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

const MAX_MESSAGES = 200;
const MAX_CONTENT = 100_000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`conversation-branch:${session.user.id}`, 10, 60_000);
  if (limited) return limited;
  const oversized = rejectOversizedBody(req, 16_384);
  if (oversized) return oversized;
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const requestedMessageId = typeof body?.messageId === "string" ? body.messageId : null;
  const source = await getConversation(session.user.id, id);
  if (!source) return new Response("Not found", { status: 404 });
  const allMessages = await listMessages(id);
  const sourceMessages = requestedMessageId
    ? (() => { const index = allMessages.findIndex((m) => m.id === requestedMessageId); return index >= 0 ? allMessages.slice(0, index + 1) : null; })()
    : allMessages.slice(0, MAX_MESSAGES);
  if (!sourceMessages) return new Response("Message not found", { status: 404 });
  const branchTitle = `${requestedMessageId ? "Branch from message" : "Branch"}: ${source.title}`.slice(0, 120);
  const branch = await createConversation(session.user.id, branchTitle, source.projectId);
  for (const message of sourceMessages) {
    if (!message.content || message.content.length > MAX_CONTENT) continue;
    await addMessage({
      conversationId: branch.id,
      role: message.role,
      content: message.content,
      modelId: message.modelId ?? undefined,
      metadata: message.metadata as Record<string, unknown> | undefined,
    });
  }
  return Response.json({ id: branch.id, title: branch.title, projectId: branch.projectId, copiedMessages: sourceMessages.length });
}
