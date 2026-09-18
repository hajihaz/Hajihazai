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
  const source = await getConversation(session.user.id, id);
  if (!source) return new Response("Not found", { status: 404 });
  const sourceMessages = (await listMessages(id)).slice(0, MAX_MESSAGES);
  const branchTitle = `Branch: ${source.title}`.slice(0, 120);
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
