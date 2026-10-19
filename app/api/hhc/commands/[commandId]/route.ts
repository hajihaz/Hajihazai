import { auth } from "@/auth";
import { actOnOwnerCommand } from "@/lib/hhc/customer-bridge";
import { rejectOversizedBody } from "@/lib/auth/request";
export const runtime = "nodejs";
type Context = { params: Promise<{ commandId: string }> };
export async function POST(req: Request, { params }: Context) {
  const s = await auth();
  if (!s?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const oversized = rejectOversizedBody(req, 256);
  if (oversized) return oversized;
  const b = await req.json().catch(() => null);
  if (b?.action !== "approve" && b?.action !== "deny")
    return Response.json({ error: "Invalid action" }, { status: 400 });
  try { return Response.json(await actOnOwnerCommand(s.user.id, (await params).commandId, b.action === "approve")); }
  catch { return Response.json({ error: "Command not found, expired, or denied" }, { status: 404 }); }
}