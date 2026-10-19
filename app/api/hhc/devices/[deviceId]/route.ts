import { auth } from "@/auth";
import { revokeOwnerDevice } from "@/lib/hhc/customer-bridge";
export const runtime = "nodejs";
type Context = { params: Promise<{ deviceId: string }> };
export async function DELETE(_req: Request, { params }: Context) {
  const s = await auth();
  if (!s?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await revokeOwnerDevice(s.user.id, (await params).deviceId)); }
  catch { return Response.json({ error: "Device not found" }, { status: 404 }); }
}
