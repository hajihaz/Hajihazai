import { auth } from "@/auth";
import { deleteMemory, updateMemory } from "@/lib/db/memory-queries";
import { embedMemory } from "@/lib/memory/embed-memory";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";


function finiteNumber(value: unknown, min: number, max: number) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return false as const;
  return n;
}

function optionalDate(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return false as const;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? false as const : d;
}

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
  const title = body?.title;
  const importance = finiteNumber(body?.importance, 1, 5);
  const confidence = finiteNumber(body?.confidence, 0, 100);
  const validFrom = optionalDate(body?.validFrom);
  const validUntil = optionalDate(body?.validUntil);
  if ([content, type, title, body?.importance, body?.confidence, body?.validFrom, body?.validUntil].every((value) => value === undefined)) {
    return new Response("nothing to update", { status: 400 });
  }
  if (content !== undefined && (typeof content !== "string" || !content.trim())) {
    return new Response("content must be a non-empty string", { status: 400 });
  }
  if (title !== undefined && title !== null && typeof title !== "string") {
    return new Response("title must be a string or null", { status: 400 });
  }
  if (importance === false) return new Response("importance must be between 1 and 5", { status: 400 });
  if (confidence === false) return new Response("confidence must be between 0 and 100", { status: 400 });
  if (validFrom === false || validUntil === false) return new Response("validity dates must be ISO dates or null", { status: 400 });
  if (validFrom === null) return new Response("validFrom cannot be null", { status: 400 });
  if (validFrom instanceof Date && validUntil instanceof Date && validUntil <= validFrom) {
    return new Response("validUntil must be after validFrom", { status: 400 });
  }

  const memory = await updateMemory(session.user.id, id, {
    ...(content !== undefined ? { content: content.trim().slice(0, 12000) } : {}),
    ...(type !== undefined ? { type: String(type).trim().slice(0, 80) } : {}),
    ...(title !== undefined ? { title: typeof title === "string" ? title.trim().slice(0, 160) || null : null } : {}),
    ...(body?.importance !== undefined ? { importance: importance as number | null } : {}),
    ...(body?.confidence !== undefined ? { confidence: confidence as number | null } : {}),
    ...(validFrom !== undefined ? { validFrom: validFrom as Date } : {}),
    ...(validUntil !== undefined ? { validUntil: validUntil as Date | null } : {}),
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
