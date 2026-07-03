import { requireAdmin } from "@/lib/admin/session";
import { isWebSearchEnabled, setWebSearchEnabled } from "@/lib/system-settings";
import { activeProvider, getLastSearchAt } from "@/lib/web/search";
import { cacheStats } from "@/lib/web/cache";

/**
 * Phase 7 — Web Search admin settings: enable/disable toggle, provider status,
 * cache statistics, and last-search timestamp.
 */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  return Response.json({
    enabled: await isWebSearchEnabled().catch(() => true),
    provider: activeProvider(),
    lastSearchAt: getLastSearchAt(),
    cache: cacheStats(),
  });
}

export async function POST(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const { enabled } = await req.json().catch(() => ({}));
  if (typeof enabled !== "boolean") return new Response("Bad request", { status: 400 });
  await setWebSearchEnabled(enabled);
  return Response.json({ ok: true, enabled });
}
