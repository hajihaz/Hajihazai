import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

const BATCH_SIZE = 500;
const TOOL_RETENTION_DAYS = 90;

export function isCronAuthorized(req: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runCleanup() {
  const now = new Date();
  const toolCutoff = new Date(now.getTime() - TOOL_RETENTION_DAYS * 86_400_000);
  const usedTokenCutoff = new Date(now.getTime() - 86_400_000);

  // Every delete is bounded and uses an indexed timestamp predicate. Canonical
  // user history (messages/conversations) is deliberately not touched here.
  await db.execute(sql`
    DELETE FROM "rate_limit_buckets"
    WHERE "bucket_key" IN (
      SELECT "bucket_key" FROM "rate_limit_buckets"
      WHERE "expires_at" <= ${now}
      ORDER BY "expires_at" ASC LIMIT ${BATCH_SIZE}
    )
  `);
  await db.execute(sql`
    DELETE FROM "session"
    WHERE "sessionToken" IN (
      SELECT "sessionToken" FROM "session"
      WHERE "expires" <= ${now}
      ORDER BY "expires" ASC LIMIT ${BATCH_SIZE}
    )
  `);
  await db.execute(sql`
    DELETE FROM "admin_sessions"
    WHERE "token" IN (
      SELECT "token" FROM "admin_sessions"
      WHERE "expires_at" <= ${now}
      ORDER BY "expires_at" ASC LIMIT ${BATCH_SIZE}
    )
  `);
  await db.execute(sql`
    DELETE FROM "password_reset_tokens"
    WHERE "id" IN (
      SELECT "id" FROM "password_reset_tokens"
      WHERE "expires_at" <= ${now}
         OR "used_at" <= ${usedTokenCutoff}
      ORDER BY "expires_at" ASC LIMIT ${BATCH_SIZE}
    )
  `);
  await db.execute(sql`
    DELETE FROM "tool_invocation"
    WHERE "id" IN (
      SELECT "id" FROM "tool_invocation"
      WHERE "createdAt" < ${toolCutoff}
      ORDER BY "createdAt" ASC LIMIT ${BATCH_SIZE}
    )
  `);

  return { ok: true, ranAt: now.toISOString() };
}

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return Response.json(await runCleanup());
  } catch (error) {
    console.error("[cron] database maintenance failed:", error);
    return Response.json({ error: "Database maintenance failed" }, { status: 500 });
  }
}
