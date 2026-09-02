import { auth } from "@/auth";
import { getUserNotifications, markNotificationRead } from "@/lib/admin/queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const items = await getUserNotifications(session.user.id);
  return Response.json({ notifications: items }, { headers: PRIVATE_NO_STORE });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const limited = await rateLimitResponse(`notifications:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 65536);
  if (oversized) return oversized;

  const body = await req.json().catch(() => ({}));
  const id = body.id;
  if (typeof id !== "string" || !id) return Response.json({ error: "id required" }, { status: 400 });

  await markNotificationRead(id, session.user.id);
  return Response.json({ ok: true });
}
