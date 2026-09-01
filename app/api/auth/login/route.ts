import { getLoginProfile } from "@/lib/db/credential-queries";
import { verifyPassword } from "@/lib/auth/password";
import { createUserSession, isSecureRequest } from "@/lib/auth/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { isEmailBlocked } from "@/lib/admin/queries";
import { syncEventToSheets } from "@/lib/google-sheets";

/** Username/email + password login. Mints an Auth.js-compatible DB session. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const identifier = typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!identifier || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  const limited = await rateLimitResponse(`login:${identifier.toLowerCase()}`, 10, 60_000);
  if (limited) return limited;

  const profile = await getLoginProfile(identifier);
  // Constant generic error — never reveal whether the account/password exists.
  const invalid = () =>
    Response.json({ error: "Invalid username or password" }, { status: 401 });

  if (!profile?.passwordHash) {
    await verifyPassword(password, "scrypt:00:00");
    return invalid();
  }
  const ok = await verifyPassword(password, profile.passwordHash);
  if (!ok) return invalid();

  // Check blocked / terminated accounts after password verification (avoids timing oracle)
  let blocked = false;
  if (profile.email) {
    try {
      blocked = await isEmailBlocked(profile.email);
    } catch (err) {
      console.error("[auth] blocked-account check failed:", err);
      return Response.json(
        { error: "Authentication service temporarily unavailable" },
        { status: 503 },
      );
    }
  }
  if (blocked || profile.isDisabled || profile.isSuspended) {
    return Response.json({ error: "This account is not active. Please contact support." }, { status: 403 });
  }

  await createUserSession(profile.userId, isSecureRequest(req));
  syncEventToSheets({ email: profile.email ?? identifier, eventType: "login", detail: "password" });
  return Response.json({ ok: true });
}
