import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { listBlockedEmails, addBlockedEmail } from "@/lib/admin/queries";

export async function GET(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const search = new URL(req.url).searchParams.get("search") ?? undefined;
  const rows = await listBlockedEmails({ search });
  return Response.json({ blockedEmails: rows });
}

export async function POST(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@")) {
    return Response.json({ error: "Valid email required" }, { status: 400 });
  }

  const row = await addBlockedEmail(email, body.reason as string | undefined);
  if (!row) return Response.json({ error: "Email already blocked" }, { status: 409 });
  return Response.json({ blockedEmail: row }, { status: 201 });
}
