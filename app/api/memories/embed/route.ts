import { auth } from "@/auth";
import { embedAllMemories } from "@/lib/memory/embed-memory";
import { rateLimitAsync } from "@/lib/ratelimit";

// Embedding calls the embedding model per memory — cap it per user.
const EMBED_LIMIT = 5;
const EMBED_WINDOW_MS = 60_000;

/** Embed all ACTIVE memories for the current user and store the vectors. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limit = await rateLimitAsync(`embed:${session.user.id}`, EMBED_LIMIT, EMBED_WINDOW_MS);
  if (!limit.ok) {
    return new Response("Too many embedding requests. Please wait.", {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((limit.retryAfterMs ?? 1000) / 1000)),
      },
    });
  }

  const result = await embedAllMemories(session.user.id);
  return Response.json(result);
}
