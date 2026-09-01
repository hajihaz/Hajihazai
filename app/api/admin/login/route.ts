import { getAdminByUsername } from "@/lib/admin/queries";
import { createAdminSession } from "@/lib/admin/session";
import { verifyPassword } from "@/lib/auth/password";
import { isSecureRequest } from "@/lib/auth/session";
import { rateLimitResponse } from "@/lib/ratelimit";

/** Admin portal login. Anyone may attempt; only valid admins get a session. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  const limited = await rateLimitResponse(`admin-login:${username.toLowerCase()}`, 8, 60_000);
  if (limited) return limited;

  const admin = await getAdminByUsername(username);
  const invalid = () =>
    Response.json({ error: "Invalid admin credentials" }, { status: 401 });
  if (!admin) {
    await verifyPassword(password, "scrypt:00:00");
    return invalid();
  }
  const ok = await verifyPassword(password, admin.passwordHash);
  if (!ok) return invalid();

  await createAdminSession(admin.id, isSecureRequest(req));
  return Response.json({ ok: true, username: admin.username });
}
