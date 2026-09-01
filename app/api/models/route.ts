import { auth } from "@/auth";
import { listLevels, defaultLevel } from "@/lib/ai/levels";
import { refreshSharedHealth } from "@/lib/ai/health";

/**
 * Returns the capability levels configured for the model selector. This endpoint
 * is metadata-only: it MUST NOT make real provider completions just because the
 * UI opened. Provider health is learned from actual chat traffic and controlled
 * health/admin paths, preventing startup requests from consuming provider quota.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  await refreshSharedHealth();
  const levels = listLevels();
  return Response.json({ levels, default: defaultLevel() });
}
