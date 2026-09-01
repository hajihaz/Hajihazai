import { auth } from "@/auth";
import { approveMemory } from "@/lib/db/memory-queries";
import { embedMemory } from "@/lib/memory/embed-memory";
import { rateLimitResponse } from "@/lib/ratelimit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const limited = await rateLimitResponse(`memory-approval:${session.user.id}`, 30, 60_000);
  if (limited) return limited;
  const { id } = await params;

  // Null → not found, not owned, or not currently pending.
  const memory = await approveMemory(session.user.id, id);
  if (!memory) {
    return new Response("Not found", { status: 404 });
  }

  // Generate embedding now that the memory is active.
  await embedMemory(session.user.id, id).catch((err) => {
    console.warn("[memories] embedding failed on approve for", id, ":", err);
  });

  return Response.json({ memory });
}
