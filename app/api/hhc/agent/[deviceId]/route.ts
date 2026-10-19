import { authenticateDevice, touchDevice, claimCommand, finishCommand } from "@/lib/hhc/customer-bridge";
import { rejectOversizedBody } from "@/lib/auth/request";
export const runtime = "nodejs";
type Context = { params: Promise<{ deviceId: string }> };
export async function GET(req: Request, { params }: Context) {
  const { deviceId } = await params;
  if (!await authenticateDevice(deviceId, req.headers.get("authorization")))
    return Response.json({ error: "Unauthorized device" }, { status: 401 });
  await touchDevice(deviceId);
  return Response.json({ command: await claimCommand(deviceId), pollAfterMs: 15000 });
}
export async function POST(req: Request, { params }: Context) {
  const { deviceId } = await params;
  if (!await authenticateDevice(deviceId, req.headers.get("authorization")))
    return Response.json({ error: "Unauthorized device" }, { status: 401 });
  const oversized = rejectOversizedBody(req, 70000);
  if (oversized) return oversized;
  const body = await req.json().catch(() => null);
  if (typeof body?.commandId !== "string" || typeof body?.ok !== "boolean")
    return Response.json({ error: "Invalid result" }, { status: 400 });
  try { return Response.json(await finishCommand(deviceId, body.commandId, body.ok, body.result)); }
  catch { return Response.json({ error: "Result denied or expired" }, { status: 409 }); }
}