import { auth } from "@/auth";
import { rateLimitResponse } from "@/lib/ratelimit";
import { listBrainsForPicker } from "@/lib/db/brain-queries";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const readLimited = await rateLimitResponse(`brains-read:${session.user.id}`, 120, 60_000);
  if (readLimited) return readLimited;


  const brains = await listBrainsForPicker();
  return Response.json({ brains }, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=60" },
  });
}
