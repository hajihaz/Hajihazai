import { auth } from "@/auth";
import { listOwnerCommands, queueOwnerCommand } from "@/lib/hhc/customer-bridge";
import { rejectOversizedBody } from "@/lib/auth/request";
import { rateLimitResponse } from "@/lib/ratelimit";
export const runtime = "nodejs";
export async function GET() {
  const s = await auth();
  if (!s?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json({ commands: await listOwnerCommands(s.user.id) }); }
  catch { return Response.json({ error: "Command access denied" }, { status: 403 }); }
}
export async function POST(req: Request) {
  const s = await auth();
  if (!s?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const limited = await rateLimitResponse("hhc:command:"+s.user.id, 20, 60_000);
  if (limited) return limited;
  const oversized = rejectOversizedBody(req, 8192);
  if (oversized) return oversized;
  const b = await req.json().catch(() => null);
  if (typeof b?.tool !== "string" || !b.args || typeof b.args !== "object" ||
      (b.deviceId !== undefined && typeof b.deviceId !== "string"))
    return Response.json({ error: "Invalid command" }, { status: 400 });
  try { return Response.json(await queueOwnerCommand(s.user.id, b), { status: 201 }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : "Command denied" }, { status: 403 }); }
}