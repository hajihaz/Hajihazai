import { auth } from "@/auth";
import { setMessageFeedback } from "@/lib/db/queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

/**
 * Phase 5 — assistant-message feedback (👍/👎). Stores the rating on the message
 * metadata (reusing the retrieval-provenance channel) so analytics can compute
 * helpfulness. Owner-scoped; no chat generation.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const limited = await rateLimitResponse(`chat-feedback:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 65536);
  if (oversized) return oversized;

  const { messageId, value } = await req.json().catch(() => ({}));
  if (typeof messageId !== "string" || (value !== "helpful" && value !== "not_helpful")) {
    return new Response("Bad request", { status: 400 });
  }

  const ok = await setMessageFeedback(session.user.id, messageId, value);
  return ok ? Response.json({ ok: true }) : new Response("Not found", { status: 404 });
}
