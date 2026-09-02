import { auth } from "@/auth";
import {
  createMemory,
  listMemories,
  listAllMemories,
  memoryStats,
} from "@/lib/db/memory-queries";
import { embedMemory } from "@/lib/memory/embed-memory";
import { rateLimitResponse } from "@/lib/ratelimit";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const status = new URL(req.url).searchParams.get("status") ?? "visible";

  let memories;
  if (status === "all") {
    memories = await listAllMemories(session.user.id);
  } else if (status === "active" || status === "pending" || status === "deleted") {
    const all = await listAllMemories(session.user.id);
    memories = all.filter((m) => m.status === status);
  } else {
    // default "visible" = active + pending (unchanged behavior)
    memories = await listMemories(session.user.id);
  }

  const stats = await memoryStats(session.user.id);
  // Strip the embedding vector from list responses (kept server-side only).
  const safe = memories.map(({ embedding, ...rest }) => rest);
  return Response.json({ memories: safe, stats }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limited = await rateLimitResponse(`memory-create:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > 100_000) {
    return new Response("Request body is too large", { status: 413 });
  }

  const body = await req.json().catch(() => null);
  const content = body?.content;
  const type = body?.type;
  if (typeof content !== "string" || !content.trim()) {
    return new Response("content is required", { status: 400 });
  }

  const memory = await createMemory(session.user.id, {
    content: content.trim(),
    type: typeof type === "string" && type.trim() ? type.trim() : undefined,
  });

  // Embed immediately so semantic retrieval works from the first chat turn.
  await embedMemory(session.user.id, memory.id).catch((err) => {
    console.warn("[memories] embedding failed for", memory.id, ":", err);
  });

  return Response.json({ memory }, { status: 201 });
}
