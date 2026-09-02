import { auth } from "@/auth";
import { createConversation, listConversations } from "@/lib/db/queries";
import { getProject } from "@/lib/db/project-queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const readLimited = await rateLimitResponse(`conversations-read:${session.user.id}`, 120, 60_000);
  if (readLimited) return readLimited;

  const rows = await listConversations(session.user.id);
  return Response.json({
    conversations: rows.map((c) => ({
      id: c.id,
      title: c.title,
      projectId: c.projectId,
      updatedAt: c.updatedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limited = await rateLimitResponse(`conversations:${session.user.id}`, 30, 60_000);
  if (limited) return limited;

  // Optional: create the chat inside a project the user owns.
  const oversized = rejectOversizedBody(req, 65536);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  const projectId = typeof body?.projectId === "string" ? body.projectId : null;
  if (projectId) {
    const owned = await getProject(session.user.id, projectId);
    if (!owned) return new Response("Not found", { status: 404 });
  }

  const convo = await createConversation(session.user.id, "New chat", projectId);
  return Response.json({ id: convo.id, title: convo.title, projectId: convo.projectId });
}
