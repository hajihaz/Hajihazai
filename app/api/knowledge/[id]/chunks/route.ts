import { auth } from "@/auth";
import { listChunks } from "@/lib/db/knowledge-chunk-queries";
import { rateLimitResponse } from "@/lib/ratelimit";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
/** Return the document's chunk count and ordered chunk list. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;

  const limited = await rateLimitResponse(`kb-chunks:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const chunks = await listChunks(session.user.id, id);
  if (chunks === null) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json({
    count: chunks.length,
    chunks: chunks.map((c) => ({
      id: c.id,
      chunkIndex: c.chunkIndex,
      content: c.content,
    })),
  }, { headers: PRIVATE_NO_STORE });
}
