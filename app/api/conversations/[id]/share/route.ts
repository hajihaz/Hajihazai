import { auth } from "@/auth";
import { getConversation } from "@/lib/db/queries";
import { createShareToken } from "@/lib/share";
import { rateLimitResponse } from "@/lib/ratelimit";
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`conversation-share:${session.user.id}`, 20, 60_000);
  if (limited) return limited;
  const { id } = await params;
  if (!(await getConversation(session.user.id, id))) return new Response("Not found", { status: 404 });
  try { const token = createShareToken(id); return Response.json({ url: `/share/${token}`, token }); }
  catch { return new Response("Sharing is not configured", { status: 503 }); }
}
