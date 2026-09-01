import { auth } from "@/auth";
import { listConversations } from "@/lib/db/queries";
import { extractMemories } from "@/lib/memory/extract";
import { rateLimitAsync } from "@/lib/ratelimit";

// Extraction calls an LLM — cap it per user to limit cost/abuse.
const EXTRACT_LIMIT = 5;
const EXTRACT_WINDOW_MS = 60_000;

/**
 * Manual extraction trigger.
 * Body: { conversationId?, preview? }
 *  - conversationId defaults to the user's most recent conversation.
 *  - preview=true returns diagnostics WITHOUT persisting anything.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limit = await rateLimitAsync(
    `extract:${session.user.id}`,
    EXTRACT_LIMIT,
    EXTRACT_WINDOW_MS,
  );
  if (!limit.ok) {
    return new Response("Too many extraction requests. Please wait.", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((limit.retryAfterMs ?? 1000) / 1000)),
      },
    });
  }

  const body = await req.json().catch(() => null);
  const preview = body?.preview === true;
  let conversationId = body?.conversationId;

  if (typeof conversationId !== "string") {
    const convos = await listConversations(session.user.id);
    if (convos.length === 0) {
      return new Response("No conversation to extract from", { status: 400 });
    }
    conversationId = convos[0].id;
  }

  const result = await extractMemories(session.user.id, conversationId, {
    preview,
  });
  if (result.reason === "not_found") {
    return new Response("Not found", { status: 404 });
  }

  return Response.json({
    conversationId: result.conversationId,
    preview,
    model: result.model ?? null,
    diagnostics: result.diagnostics,
    created: result.created,
    count: result.created.length,
  });
}
