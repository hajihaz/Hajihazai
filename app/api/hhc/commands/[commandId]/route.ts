import { auth } from "@/auth";
import { actOnOwnerCommand, cancelOwnerCommand, getOwnerCommand } from "@/lib/hhc/customer-bridge";
import { rejectOversizedBody } from "@/lib/auth/request";
export const runtime = "nodejs";
type Context = { params: Promise<{ commandId: string }> };
export async function GET(_req: Request, { params }: Context) {
  const s = await auth();
  if (!s?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).commandId;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const command = await getOwnerCommand(s.user.id, id);
    if (!command) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ command }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ error: "Request unavailable" }, { status: 403 }); }
}

export async function POST(req: Request, { params }: Context) {
  const s = await auth();
  if (!s?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const oversized = rejectOversizedBody(req, 256);
  if (oversized) return oversized;
  const b = await req.json().catch(() => null);
  if (b?.action !== "approve" && b?.action !== "deny" && b?.action !== "cancel")
    return Response.json({ error: "Invalid action" }, { status: 400 });
  try {
    const id = (await params).commandId;
    return Response.json(b.action === "cancel"
      ? await cancelOwnerCommand(s.user.id, id)
      : await actOnOwnerCommand(s.user.id, id, b.action === "approve"));
  }
  catch { return Response.json({ error: "Command not found, expired, or denied" }, { status: 404 }); }
}