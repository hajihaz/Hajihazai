import { auth } from "@/auth";
import {
  createMemory,
  listMemories,
  listAllMemories,
  memoryStats,
} from "@/lib/db/memory-queries";
import { embedMemory } from "@/lib/memory/embed-memory";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";


function finiteNumber(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function optionalDate(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return false as const;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? false as const : d;
}

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

  const oversized = rejectOversizedBody(req, 100000);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  const content = body?.content;
  const type = body?.type;
  const title = body?.title;
  const importance = finiteNumber(body?.importance, 1, 5);
  const confidence = finiteNumber(body?.confidence, 0, 100);
  const validUntil = optionalDate(body?.validUntil);
  if (typeof content !== "string" || !content.trim()) {
    return new Response("content is required", { status: 400 });
  }
  if (title !== undefined && title !== null && typeof title !== "string") {
    return new Response("title must be a string", { status: 400 });
  }
  if (importance === null) return new Response("importance must be between 1 and 5", { status: 400 });
  if (confidence === null) return new Response("confidence must be between 0 and 100", { status: 400 });
  if (validUntil === false) return new Response("validUntil must be an ISO date or null", { status: 400 });

  const memory = await createMemory(session.user.id, {
    content: content.trim().slice(0, 12000),
    type: typeof type === "string" && type.trim() ? type.trim().slice(0, 80) : undefined,
    title: typeof title === "string" ? title.trim().slice(0, 160) || null : undefined,
    importance,
    confidence,
    ...(validUntil !== undefined ? { validUntil } : {}),
  });

  // Embed immediately so semantic retrieval works from the first chat turn.
  await embedMemory(session.user.id, memory.id).catch((err) => {
    console.warn("[memories] embedding failed for", memory.id, ":", err);
  });

  return Response.json({ memory }, { status: 201 });
}
