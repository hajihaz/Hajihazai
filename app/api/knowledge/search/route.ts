import { auth } from "@/auth";
import {
  semanticDocumentSearch,
  DEFAULT_DOC_SIMILARITY_THRESHOLD,
} from "@/lib/knowledge/semantic-search";
import { rateLimitAsync } from "@/lib/ratelimit";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
/** Semantic search over the current user's knowledge-base chunks. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Each query embeds text via the model — cap per user.
  const limited = await rateLimitAsync(`kb-search:${session.user.id}`, 30, 60_000);
  if (!limited.ok) {
    return new Response("Too many search requests. Please wait.", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((limited.retryAfterMs ?? 1000) / 1000)),
      },
    });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 500);
  const requestedLimit = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
    : 10;
  const thresholdParam = Number(url.searchParams.get("threshold"));
  // Never allow the client to weaken the calibrated retrieval floor.
  // A caller may request a stricter threshold, but not bypass relevance checks
  // with negative/zero values that turn semantic search into broad disclosure.
  const threshold = Number.isFinite(thresholdParam)
    ? Math.min(Math.max(thresholdParam, DEFAULT_DOC_SIMILARITY_THRESHOLD), 1)
    : DEFAULT_DOC_SIMILARITY_THRESHOLD;

  if (!q.trim()) {
    return Response.json({ query: "", threshold, results: [] }, { headers: PRIVATE_NO_STORE });
  }

  const results = await semanticDocumentSearch(
    session.user.id,
    q,
    limit,
    threshold,
  );
  return Response.json({ query: q, threshold, results }, { headers: PRIVATE_NO_STORE });
}
