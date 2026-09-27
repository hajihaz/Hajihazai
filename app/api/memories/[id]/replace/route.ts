import { auth } from "@/auth";
import { replaceMemory } from "@/lib/db/memory-queries";
import { embedMemory } from "@/lib/memory/embed-memory";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

function numberOrUndefined(value: unknown, min: number, max: number) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : false as const;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`memory-mutation:${session.user.id}`, 60, 60_000);
  if (limited) return limited;
  const oversized = rejectOversizedBody(req, 65536);
  if (oversized) return oversized;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const content = typeof body?.content === "string" ? body.content.trim() : "";
  if (!content) return new Response("content is required", { status: 400 });
  const importance = numberOrUndefined(body?.importance, 1, 5);
  const confidence = numberOrUndefined(body?.confidence, 0, 100);
  if (importance === false) return new Response("importance must be between 1 and 5", { status: 400 });
  if (confidence === false) return new Response("confidence must be between 0 and 100", { status: 400 });

  let validUntil: Date | null | undefined;
  if (body?.validUntil !== undefined) {
    if (body.validUntil === null || body.validUntil === "") validUntil = null;
    else if (typeof body.validUntil === "string") {
      const parsed = new Date(body.validUntil);
      if (Number.isNaN(parsed.getTime())) return new Response("validUntil must be an ISO date or null", { status: 400 });
      validUntil = parsed;
    } else return new Response("validUntil must be an ISO date or null", { status: 400 });
  }

  const replaced = await replaceMemory(session.user.id, id, {
    content: content.slice(0, 12000),
    ...(typeof body?.type === "string" && body.type.trim() ? { type: body.type.trim().slice(0, 80) } : {}),
    ...(body?.title !== undefined ? { title: typeof body.title === "string" ? body.title.trim().slice(0, 160) || null : null } : {}),
    ...(body?.importance !== undefined ? { importance: importance as number | null } : {}),
    ...(body?.confidence !== undefined ? { confidence: confidence as number | null } : {}),
    ...(validUntil !== undefined ? { validUntil } : {}),
  });
  if (!replaced) return new Response("Memory is not active or was already superseded", { status: 409 });

  await embedMemory(session.user.id, replaced.replacement.id).catch((err) => {
    console.warn("[memories] embedding failed for replacement", replaced.replacement.id, ":", err);
  });

  return Response.json(replaced, { status: 201 });
}
