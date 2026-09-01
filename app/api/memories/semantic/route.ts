import { auth } from "@/auth";
import {
  semanticSearch,
  DEFAULT_SIMILARITY_THRESHOLD,
} from "@/lib/memory/semantic-search";
import { rateLimitAsync } from "@/lib/ratelimit";

/** Semantic search over the current user's active memories. User-scoped. */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Each query embeds text via the model — cap per user.
  const limited = await rateLimitAsync(`semantic:${session.user.id}`, 30, 60_000);
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
    : DEFAULT_SIMILARITY_THRESHOLD;

  if (!q.trim()) {
    return Response.json({ query: "", threshold, results: [] });
  }

  const results = await semanticSearch(session.user.id, q, limit, threshold);
  return Response.json({ query: q, threshold, results });
}
