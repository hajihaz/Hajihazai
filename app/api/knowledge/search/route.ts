import { auth } from "@/auth";
import {
  semanticDocumentSearch,
  DEFAULT_DOC_SIMILARITY_THRESHOLD,
} from "@/lib/knowledge/semantic-search";
import { rateLimitAsync } from "@/lib/ratelimit";

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
  const q = url.searchParams.get("q") ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit")) || 10, 50);
  const thresholdParam = Number(url.searchParams.get("threshold"));
  const threshold = Number.isFinite(thresholdParam)
    ? thresholdParam
    : DEFAULT_DOC_SIMILARITY_THRESHOLD;

  if (!q.trim()) {
    return Response.json({ query: "", threshold, results: [] });
  }

  const results = await semanticDocumentSearch(
    session.user.id,
    q,
    limit,
    threshold,
  );
  return Response.json({ query: q, threshold, results });
}
