import { completePairing } from "@/lib/hhc/customer-bridge";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rateLimitIdentity, rejectOversizedBody } from "@/lib/auth/request";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const oversized = rejectOversizedBody(req, 2048);
  if (oversized) return oversized;
  const limited = await rateLimitResponse(rateLimitIdentity(req, "hhc:complete-pair"), 10, 60_000);
  if (limited) return limited;
  const data = await req.json().catch(() => null);
  if (typeof data?.pairingCode !== "string" || typeof data?.name !== "string")
    return Response.json({ error: "Invalid input" }, { status: 400 });
  try { return Response.json(await completePairing(data.pairingCode, data.name), { status: 201 }); }
  catch { return Response.json({ error: "Invalid or expired pairing code" }, { status: 403 }); }
}