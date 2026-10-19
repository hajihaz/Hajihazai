import { auth } from "@/auth";
import { hhcCustomerEnabled, listOwnerDevices, startPairing } from "@/lib/hhc/customer-bridge";
import { rateLimitResponse } from "@/lib/ratelimit";
export const runtime = "nodejs";
export async function GET() {
  const s = await auth();
  if (!s?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json({ enabled: hhcCustomerEnabled(), devices: await listOwnerDevices(s.user.id) }); }
  catch { return Response.json({ error: "Device access unavailable" }, { status: 403 }); }
}
export async function POST() {
  const s = await auth();
  if (!s?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rate = await rateLimitResponse("hhc:pair:"+s.user.id, 6, 60 * 60_000);
  if (rate) return rate;
  try { return Response.json(await startPairing(s.user.id), { status: 201 }); }
  catch { return Response.json({ error: "Device pairing unavailable" }, { status: 403 }); }
}