import { auth } from "@/auth";
import { listAllMemories } from "@/lib/db/memory-queries";
import { rateLimitResponse } from "@/lib/ratelimit";

/** Export ALL of the current user's memories as a downloadable JSON file. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limited = await rateLimitResponse(`memory-export:${session.user.id}`, 10, 60_000);
  if (limited) return limited;

  const memories = await listAllMemories(session.user.id);
  const payload = {
    exportedAt: new Date().toISOString(),
    userId: session.user.id,
    count: memories.length,
    memories,
  };

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="hajihaz-memories.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
