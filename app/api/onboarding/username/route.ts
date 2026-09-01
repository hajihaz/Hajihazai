import { auth } from "@/auth";
import { validateUsername } from "@/lib/onboarding/validate";
import { isUsernameAvailable } from "@/lib/db/profile-queries";
import { rateLimitResponse } from "@/lib/ratelimit";

/** Real-time username availability check. GET /api/onboarding/username?u=foo */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limited = await rateLimitResponse(`username-check:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const u = new URL(req.url).searchParams.get("u") ?? "";
  const valid = validateUsername(u);
  if (!valid.ok) {
    return Response.json({ valid: false, available: false, error: valid.error });
  }

  const available = await isUsernameAvailable(valid.value);
  return Response.json({
    valid: true,
    available,
    error: available ? null : "That username is taken",
  });
}
