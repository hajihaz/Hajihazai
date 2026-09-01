import { auth } from "@/auth";
import {
  bulkApprove,
  bulkDelete,
  bulkReject,
} from "@/lib/db/memory-queries";
import { embedMemory } from "@/lib/memory/embed-memory";
import { rateLimitResponse } from "@/lib/ratelimit";

/**
 * Bulk actions on the user's own memories.
 * Body: { action: "approve" | "reject" | "delete", ids: string[] }
 * Ownership is enforced in every query (userId scope).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limited = await rateLimitResponse(`memory-bulk:${session.user.id}`, 30, 60_000);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const action = body?.action;
  const ids = body?.ids;

  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
    return new Response("ids must be an array of strings", { status: 400 });
  }
  if (!["approve", "reject", "delete"].includes(action)) {
    return new Response("invalid action", { status: 400 });
  }
  if (ids.length > 100) {
    return new Response("A maximum of 100 memory IDs can be processed at once", { status: 413 });
  }

  let affected;
  if (action === "approve") {
    affected = await bulkApprove(session.user.id, ids);
    // Embed all newly active memories in parallel; failures are non-fatal.
    await Promise.allSettled(
      affected.map((m) =>
        embedMemory(session.user.id, m.id).catch((err) =>
          console.warn("[memories] bulk embed failed for", m.id, ":", err),
        ),
      ),
    );
  } else if (action === "reject") {
    affected = await bulkReject(session.user.id, ids);
  } else {
    affected = await bulkDelete(session.user.id, ids);
  }

  return Response.json({
    action,
    affected: affected.length,
    ids: affected.map((a) => a.id),
  });
}
