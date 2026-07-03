import { requireAdmin } from "@/lib/admin/session";
import { isWebSearchEnabled, setWebSearchEnabled } from "@/lib/system-settings";
import { activeProvider, getLastSearchAt, hasProductionGradeProvider, isWebProviderReady } from "@/lib/web/search";
import { cacheStats } from "@/lib/web/cache";

/**
 * Phase 7 — Web Search admin settings: enable/disable toggle, provider status,
 * cache statistics, and last-search timestamp. `active` is the effective state:
 * the toggle AND a provider ready for this environment (production requires a
 * real search API key — the keyless scraper is dev-only).
 */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const enabled = await isWebSearchEnabled().catch(() => true);
  return Response.json({
    enabled,
    provider: activeProvider(),
    productionGrade: hasProductionGradeProvider(),
    active: enabled && isWebProviderReady(),
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
