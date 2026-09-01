import { auth } from "@/auth";
import { getProfile } from "@/lib/db/profile-queries";
import { updateUsername } from "@/lib/db/credential-queries";
import { validateUsername } from "@/lib/onboarding/validate";
import { rateLimitResponse } from "@/lib/ratelimit";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const p = await getProfile(session.user.id);
  if (!p) return new Response("Not found", { status: 404 });
  return Response.json({
    profile: {
      username: p.username,
      email: p.email,
      name: p.googleName,
      profilePicture: p.profilePicture,
      createdAt: p.createdAt,
      hasPassword: !!p.passwordHash,
    },
  }, { headers: PRIVATE_NO_STORE });
}

/** Change username. */
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const limited = await rateLimitResponse(`profile:${session.user.id}`, 20, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const uname = validateUsername(body?.username);
  if (!uname.ok) return Response.json({ error: uname.error }, { status: 400 });

  const result = await updateUsername(session.user.id, uname.value);
  if (!result.ok) {
    return Response.json({ error: "That username is taken" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
