import { requireAdmin } from "@/lib/admin/session";
import { isWebSearchEnabled, setWebSearchEnabled } from "@/lib/system-settings";
import { activeProvider, getLastSearchAt, hasProductionGradeProvider } from "@/lib/web/search";
import { cacheStats } from "@/lib/web/cache";

/**
 * Web Search admin settings: enable/disable toggle, provider status, cache
 * statistics, last-search timestamp, and a plain-English warning (Rule #5).
 *
 * `active` = the layer will be ATTEMPTED for live/website queries (the toggle is
 * on; a provider — at minimum the keyless DuckDuckGo scraper — is always
 * callable). `productionGrade` = a real search key (Tavily/Brave/Serper) is set.
 * When active but not production-grade, current-event verification leans on the
 * rate-limited keyless scraper and will frequently REFUSE rather than answer —
 * `warning` says so. Website summarization needs no key and works regardless.
 */
export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const enabled = await isWebSearchEnabled().catch(() => true);
  const productionGrade = hasProductionGradeProvider();

  const warning = !enabled
    ? "Live web search is OFF — current-event questions are refused (never answered from model memory). Website summarization still works (it needs no provider)."
    : !productionGrade
    ? "No production-grade search provider configured. Set TAVILY_API_KEY (or BRAVE_SEARCH_API_KEY / SERPER_API_KEY) for reliable current-event verification — the keyless DuckDuckGo fallback is rate-limited and will often refuse under real traffic. Website summarization works without a key."
    : null;

  return Response.json({
    enabled,
    provider: activeProvider(),
    productionGrade,
    // Attempted whenever enabled — the keyless provider is always callable, and a
    // failed attempt refuses (it never hallucinates), so we no longer gate on a key.
    active: enabled,
    warning,
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
