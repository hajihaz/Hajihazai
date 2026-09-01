import { createPasswordUser } from "@/lib/db/credential-queries";
import { hashPassword, validatePassword } from "@/lib/auth/password";
import { createUserSession, isSecureRequest } from "@/lib/auth/session";
import { validateUsername } from "@/lib/onboarding/validate";
import { rateLimitResponse } from "@/lib/ratelimit";
import { isEmailBlocked } from "@/lib/admin/queries";
import { syncUserToSheets } from "@/lib/google-sheets";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Create a username/password account (in addition to Google). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const uname = validateUsername(body?.username);
  if (!uname.ok) return Response.json({ error: uname.error }, { status: 400 });

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "A valid email is required" }, { status: 400 });
  }

  // Block terminated / banned accounts before doing any DB writes
  let blocked: boolean;
  try {
    blocked = await isEmailBlocked(email);
  } catch (err) {
    console.error("[auth] blocked-account check failed:", err);
    return Response.json(
      { error: "Registration service temporarily unavailable" },
      { status: 503 },
    );
  }
  if (blocked) {
    return Response.json(
      { error: "This email address is not allowed to register" },
      { status: 403 },
    );
  }

  const pw = validatePassword(body?.password);
  if (!pw.ok) return Response.json({ error: pw.error }, { status: 400 });

  const limited = await rateLimitResponse(`register:${email}`, 5, 60_000);
  if (limited) return limited;

  const passwordHash = await hashPassword(pw.value);
  const result = await createPasswordUser({
    username: uname.value,
    email,
    passwordHash,
  });
  if (!result.ok) {
    return Response.json(
      { error: "That username or email is already registered" },
      { status: 409 },
    );
  }

  await createUserSession(result.userId, isSecureRequest(req));

  // Non-blocking Google Sheets sync — never delays or fails the signup
  syncUserToSheets({ email, name: uname.value, source: "credentials", createdAt: new Date() });

  return Response.json({ ok: true });
}
