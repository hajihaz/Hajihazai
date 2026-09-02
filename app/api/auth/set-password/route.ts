import { auth } from "@/auth";
import { getProfile } from "@/lib/db/profile-queries";
import { setUserPassword } from "@/lib/db/credential-queries";
import { hashPassword, verifyPassword, validatePassword } from "@/lib/auth/password";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

/**
 * Set or change the signed-in user's password. Google-only users (no existing
 * hash) may set one without a current password; users who already have a
 * password must supply the correct current one.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const limited = await rateLimitResponse(`set-password:${session.user.id}`, 10, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  const pw = validatePassword(body?.password);
  if (!pw.ok) return Response.json({ error: pw.error }, { status: 400 });

  const profile = await getProfile(session.user.id);
  if (!profile) return new Response("Not found", { status: 404 });

  if (profile.passwordHash) {
    const current = typeof body?.currentPassword === "string" ? body.currentPassword : "";
    const ok = await verifyPassword(current, profile.passwordHash);
    if (!ok) {
      return Response.json({ error: "Current password is incorrect" }, { status: 403 });
    }
  }

  await setUserPassword(session.user.id, await hashPassword(pw.value));
  return Response.json({ ok: true });
}
