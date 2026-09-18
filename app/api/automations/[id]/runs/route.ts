import { auth } from "@/auth";
import { listAutomationRuns } from "@/lib/db/automation-queries";
import { rateLimitResponse } from "@/lib/ratelimit";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params; const limited = await rateLimitResponse(`automation-runs:${session.user.id}`, 120, 60_000); if (limited) return limited;
  const runs = await listAutomationRuns(session.user.id, id); if (runs === null) return new Response("Not found", { status: 404 });
  return Response.json({ runs }, { headers: { "Cache-Control": "private, no-store" } });
}