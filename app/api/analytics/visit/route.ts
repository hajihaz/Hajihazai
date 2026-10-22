import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { productTrafficEvents } from "@/lib/db/schema";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import {analyticsProductPath,analyticsProductAction,analyticsTrustedOrigin} from "@/lib/analytics-traffic-path";

export const runtime = "nodejs";

const ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
const KINDS = new Set(["visit", "view", "tap", "active_time"]);

/** Strictly voluntary, first-party usage telemetry; no chat contents or form values. */
export async function POST(request: Request) {
  if(!analyticsTrustedOrigin(request.headers.get("origin"),request.url))
    return Response.json({error:"Invalid origin"},{status:403});

  const oversized = rejectOversizedBody(request, 2048);
  if (oversized) return oversized;
  const data = await request.json().catch(() => null);
  if (!data || data.consent !== true) return new Response("Consent required", { status: 400 });
  const visitorId = data.visitorId, sessionId = data.sessionId;
  const path: unknown = data.path;
  const kind = data.kind;
  const target = data.target;
  const durationSeconds = data.durationSeconds;
  if (typeof visitorId !== "string" || !ID.test(visitorId) ||
      typeof sessionId !== "string" || !ID.test(sessionId) ||
      typeof kind !== "string" || !KINDS.has(kind) ||
      typeof path !== "string" || path.length < 1 || path.length > 300 ||
      analyticsProductPath(path) !== path ||
      (target !== undefined && target !== null && (typeof target !== "string" || target.length > 80 || analyticsProductAction(target) !== target)) ||
      (durationSeconds !== undefined && durationSeconds !== null && (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 180))) {
    return new Response("Invalid event", { status: 400 });
  }
  if (kind !== "tap" && target != null) return new Response("Invalid target", { status: 400 });
  if (kind !== "active_time" && durationSeconds != null) return new Response("Invalid duration", { status: 400 });
  // Hash before passing to the shared limiter. Raw IPs and HTTP headers are never persisted.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = createHash("sha256").update(ip).digest("hex").slice(0, 24);
  const limited = await rateLimitResponse("traffic:" + key, 360, 60 * 60 * 1000);
  if (limited) return limited;
  const session = await auth().catch(() => null);
  try {
    await db.insert(productTrafficEvents).values({
      visitorId, sessionId, kind, path,
      target: kind === "tap" ? target ?? null : null,
      durationSeconds: kind === "active_time" ? durationSeconds ?? null : null,
      userId: session?.user?.id ?? null,
    });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[traffic] non-fatal insert failed", error);
    return new Response("Analytics currently unavailable", { status: 503 });
  }
}
