import { consumeResetToken, revokeOtherSessions, setUserPassword } from "@/lib/db/credential-queries";
import { hashPassword, hashToken, validatePassword } from "@/lib/auth/password";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rateLimitIdentity, rejectOversizedBody } from "@/lib/auth/request";

/** Complete a password reset with a token from the emailed link. */
export async function POST(req: Request) {
  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) return Response.json({ error: "Invalid or expired link" }, { status: 400 });

  const ipLimited = await rateLimitResponse(rateLimitIdentity(req, "reset"), 20, 60_000);
  if (ipLimited) return ipLimited;

  const limited = await rateLimitResponse(`reset:${token.slice(0, 16)}`, 10, 60_000);
  if (limited) return limited;

  const pw = validatePassword(body?.password);
  if (!pw.ok) return Response.json({ error: pw.error }, { status: 400 });

  const userId = await consumeResetToken(hashToken(token));
  if (!userId) {
    return Response.json({ error: "This reset link is invalid or expired" }, { status: 400 });
  }

  await setUserPassword(userId, await hashPassword(pw.value));
  await revokeOtherSessions(userId);
  return Response.json({ ok: true });
}
