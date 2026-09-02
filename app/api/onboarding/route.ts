import { auth } from "@/auth";
import {
  validateUsername,
  validateMobile,
  validateCountryCode,
} from "@/lib/onboarding/validate";
import {
  completeOnboarding,
  getProfile,
  isProfileComplete,
} from "@/lib/db/profile-queries";
import { submitToSheet } from "@/lib/onboarding/sheets";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

/** Complete onboarding: { username, mobileNumber, countryCode }. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limited = await rateLimitResponse(`onboarding:${session.user.id}`, 20, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 65536);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);

  // Server-side validation — never trust the client.
  const username = validateUsername(body?.username);
  if (!username.ok) return Response.json({ ok: false, error: username.error }, { status: 400 });
  const countryCode = validateCountryCode(body?.countryCode);
  if (!countryCode.ok) return Response.json({ ok: false, error: countryCode.error }, { status: 400 });
  const mobile = validateMobile(body?.mobileNumber);
  if (!mobile.ok) return Response.json({ ok: false, error: mobile.error }, { status: 400 });

  // Already onboarded? (idempotent guard)
  const existing = await getProfile(session.user.id);
  if (isProfileComplete(existing)) {
    return Response.json({ ok: true, alreadyComplete: true });
  }

  // Race-safe write (DB unique index on lower(username) is the real guard).
  // Pass the session identity so the profile row is created here if the
  // sign-in event never managed to (self-healing — see completeOnboarding).
  const result = await completeOnboarding(
    session.user.id,
    {
      username: username.value,
      mobileNumber: mobile.value,
      countryCode: countryCode.value,
    },
    {
      email: session.user.email ?? "",
      googleName: session.user.name ?? "",
      profilePicture: session.user.image ?? "",
    },
  );
  if (!result.ok) {
    if (result.error === "username_taken") {
      return Response.json({ ok: false, error: "That username is taken" }, { status: 409 });
    }
    return Response.json({ ok: false, error: "Profile not found — please sign in again" }, { status: 400 });
  }

  // Best-effort Google Sheets submission — must NOT block the user.
  const p = result.profile;
  await submitToSheet({
    username: p.username ?? username.value,
    email: p.email,
    mobile: p.mobileNumber ?? mobile.value,
    countryCode: p.countryCode ?? countryCode.value,
    googleName: p.googleName ?? "",
    googleId: p.googleId ?? "",
    picture: p.profilePicture ?? "",
  });

  return Response.json({ ok: true });
}
