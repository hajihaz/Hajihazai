import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { users, userProfiles } from "@/lib/db/schema";
import { createUserSession, isSecureRequest } from "@/lib/auth/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rateLimitIdentity } from "@/lib/auth/request";

const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Create a short-lived, non-personal guest workspace. */
export async function POST(req: Request) {
  const limited = await rateLimitResponse(
    rateLimitIdentity(req, "guest-login"),
    5,
    60 * 60_000,
  );
  if (limited) return limited;

  const id = randomUUID();
  const email = `guest-${id}@guest.hajihaz.ai`;
  const username = `guest-${id.slice(0, 8)}`;

  try {
    await db.insert(users).values({ id, name: "Guest", email });
    await db.insert(userProfiles).values({
      userId: id,
      email,
      username,
      googleName: "Guest",
    });
    await createUserSession(id, isSecureRequest(req), GUEST_SESSION_TTL_MS);
    return Response.json(
      { ok: true, guest: true },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (err) {
    console.error("[auth] guest account creation failed:", err);
    return Response.json(
      { error: "Guest access is temporarily unavailable" },
      { status: 503 },
    );
  }
}
