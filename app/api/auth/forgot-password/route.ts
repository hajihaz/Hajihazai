import { getLoginProfile, createResetToken } from "@/lib/db/credential-queries";
import { generateToken } from "@/lib/auth/password";
import { sendPasswordResetEmail } from "@/lib/email/send";
import { rateLimitResponse } from "@/lib/ratelimit";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Request a password reset by username or email. Always returns a generic
 *  success so attackers can't enumerate which accounts exist. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";

  const limited = await rateLimitResponse(`forgot:${identifier.toLowerCase() || "anon"}`, 5, 60_000);
  if (limited) return limited;

  const generic = Response.json({
    ok: true,
    message: "If that account exists, a reset link has been sent.",
  });
  if (!identifier) return generic;

  const profile = await getLoginProfile(identifier);
  if (profile?.email) {
    const { token, tokenHash } = generateToken();
    await createResetToken(profile.userId, tokenHash, new Date(Date.now() + TOKEN_TTL_MS));
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.AUTH_URL ??
      new URL(req.url).origin;
    const resetUrl = `${origin.replace(/\/$/, "")}/reset-password?token=${token}`;
    await sendPasswordResetEmail(profile.email, resetUrl);
  }
  return generic;
}
