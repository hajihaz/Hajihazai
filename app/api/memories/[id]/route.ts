import { auth } from "@/auth";
import { deleteMemory, updateMemory } from "@/lib/db/memory-queries";
import { embedMemory } from "@/lib/memory/embed-memory";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const limited = await rateLimitResponse(`memory-mutation:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 65536);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  const content = body?.content;
  const type = body?.type;
  if (content === undefined && type === undefined) {
    return new Response("nothing to update", { status: 400 });
  }
  if (content !== undefined && (typeof content !== "string" || !content.trim())) {
    return new Response("content must be a non-empty string", { status: 400 });
  }

  const memory = await updateMemory(session.user.id, id, {
    ...(content !== undefined ? { content: content.trim() } : {}),
    ...(type !== undefined ? { type: String(type).trim() } : {}),
  });

  // Null means the memory does not exist OR is not owned by this user.
  if (!memory) {
    return new Response("Not found", { status: 404 });
  }

  // Re-embed when content changes so the vector stays consistent with the text.
  if (content !== undefined) {
    await embedMemory(session.user.id, id).catch((err) => {
      console.warn("[memories] re-embedding failed on update for", id, ":", err);
    });
  }

  return Response.json({ memory });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const limited = await rateLimitResponse(`memory-mutation:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const deleted = await deleteMemory(session.user.id, id);
  if (!deleted) {
    return new Response("Not found", { status: 404 });
  }
  return new Response(null, { status: 204 });
}
