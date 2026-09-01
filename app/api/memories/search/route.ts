import { auth } from "@/auth";
import { rateLimitResponse } from "@/lib/ratelimit";
import { searchMemories, searchWithDiagnostics } from "@/lib/memory/retrieve";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
type MemoryRow = {
  id: string;
  type: string;
  content: string;
  status: string;
  score: number;
  updatedAt: Date | string;
};

function serialize(m: MemoryRow) {
  return {
    id: m.id,
    type: m.type,
    content: m.content,
    status: m.status,
    score: m.score,
    updatedAt: m.updatedAt instanceof Date ? m.updatedAt.toISOString() : m.updatedAt,
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limited = await rateLimitResponse(`memory-search:${session.user.id}`, 120, 60_000);
  if (limited) return limited;

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 500);
  const debug = url.searchParams.get("debug");

  if (debug === "1" || debug === "true") {
    const data = await searchWithDiagnostics(session.user.id, q);
    return Response.json({
      query: data.query,
      results: data.results.map(serialize),
      excluded: data.excluded,
    }, { headers: PRIVATE_NO_STORE });
  }

  const results = await searchMemories(session.user.id, q);
  return Response.json({ query: q, results: results.map(serialize) }, { headers: PRIVATE_NO_STORE });
}
