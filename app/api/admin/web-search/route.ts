import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { isWebSearchEnabled, setWebSearchEnabled } from "@/lib/system-settings";
import { activeProvider, getLastSearchAt, hasProductionGradeProvider } from "@/lib/web/search";
import { cacheStats } from "@/lib/web/cache";

/**
 * Web Search admin settings: enable/disable toggle, provider status, cache
 * statistics, last-search timestamp, and a plain-English warning (Rule #5).
 *
 * `active` = live web search is actually enabled for production use. A
 * production-grade provider is required before activation; keyless scraping is
 * never used in production. Website summarization remains independent of this
 * search toggle.
 */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-read:web-search:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;
  const enabled = await isWebSearchEnabled().catch(() => true);
  const productionGrade = hasProductionGradeProvider();

  const warning = !enabled
    ? "Live web search is OFF — current-event questions are refused (never answered from model memory). Website summarization still works (it needs no provider)."
    : !productionGrade
    ? "No production-grade search provider configured. Live web search cannot be activated in production until TAVILY_API_KEY, BRAVE_SEARCH_API_KEY, SERPER_API_KEY, or GROQ_API_KEY is configured. Website summarization works without a search provider."
    : null;

  return Response.json({
    enabled,
    provider: activeProvider(),
    productionGrade,
    active: enabled && productionGrade,
    warning,
    lastSearchAt: getLastSearchAt(),
    cache: cacheStats(),
  });
}

export async function POST(req: Request) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;
  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const { enabled } = await req.json().catch(() => ({}));
  if (typeof enabled !== "boolean") return new Response("Bad request", { status: 400 });
  const productionGrade = hasProductionGradeProvider();
  if (enabled && !productionGrade && process.env.NODE_ENV === "production") {
    return Response.json({
      ok: false,
      enabled: false,
      productionGrade: false,
      error: "A production-grade web search provider is required before live web search can be enabled.",
    }, { status: 409 });
  }
  await setWebSearchEnabled(enabled);
  return Response.json({ ok: true, enabled, productionGrade });
}
