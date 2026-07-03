/**
 * Phase 2 — web search layer. `webSearch(query)` returns ranked, trusted,
 * de-duplicated results ({title, url, snippet, timestamp}). Provider is chosen
 * from env at call time; falls back to a keyless DuckDuckGo HTML scrape so the
 * feature works with no configuration. Results are cached per-kind (Phase 6).
 *
 * To upgrade quality, set one of TAVILY_API_KEY / BRAVE_SEARCH_API_KEY /
 * SERPER_API_KEY in the environment — no code change needed.
 */
import { rankAndFilter, type WebResult } from "./sources";
import { getCached, setCached } from "./cache";

const FETCH_TIMEOUT_MS = 8_000;
let lastSearchAt: number | null = null;

export function getLastSearchAt(): number | null { return lastSearchAt; }

export function activeProvider(): "tavily" | "brave" | "serper" | "duckduckgo" {
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
  if (process.env.SERPER_API_KEY) return "serper";
  return "duckduckgo";
}

/**
 * True when a production-grade search API (Tavily / Brave / Serper) is
 * configured. The keyless DuckDuckGo scraper is a dev/local convenience only —
 * it rate-limits under real traffic and must NOT be production's sole provider.
 */
export function hasProductionGradeProvider(): boolean {
  return !!(process.env.TAVILY_API_KEY || process.env.BRAVE_SEARCH_API_KEY || process.env.SERPER_API_KEY);
}

/**
 * Whether the web layer may run in this environment: always in dev/preview
 * (keyless fallback is fine for testing); in production ONLY with a real
 * search API key. Without one, every query follows the existing internal path.
 */
export function isWebProviderReady(): boolean {
  return hasProductionGradeProvider() || process.env.NODE_ENV !== "production";
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

const nowIso = () => new Date().toISOString();
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim();

/* ------------------------------- providers ------------------------------- */

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function decodeDdgHref(href: string): string {
  const uddg = /[?&]uddg=([^&]+)/.exec(href);
  if (uddg) href = decodeURIComponent(uddg[1]);
  if (href.startsWith("//")) href = "https:" + href;
  return href;
}

/**
 * Keyless DuckDuckGo. Tries the HTML endpoint, then the Lite endpoint (which
 * rate-limits differently), so a transient block on one still returns results.
 * Best-effort — the caller falls back gracefully on empty (Phase 8).
 */
async function duckduckgo(query: string): Promise<WebResult[]> {
  const ts = nowIso();

  // 1) html.duckduckgo.com — result__a link + result__snippet.
  try {
    const res = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const html = await res.text();
      const out: WebResult[] = [];
      const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && out.length < 12) {
        const href = decodeDdgHref(m[1]);
        const title = stripTags(m[2]);
        if (href.startsWith("http") && title) out.push({ title, url: href, snippet: stripTags(m[3]), timestamp: ts });
      }
      if (out.length) return out;
    }
  } catch { /* fall through to lite */ }

  // 2) lite.duckduckgo.com/lite — result-link anchors + result-snippet cells.
  const res = await fetchWithTimeout(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`ddg-lite http ${res.status}`);
  const html = await res.text();
  const out: WebResult[] = [];
  const links = [...html.matchAll(/<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const snips = [...html.matchAll(/<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g)].map((s) => stripTags(s[1]));
  links.forEach((l, i) => {
    const href = decodeDdgHref(l[1]);
    const title = stripTags(l[2]);
    if (href.startsWith("http") && title && out.length < 12) out.push({ title, url: href, snippet: snips[i] ?? "", timestamp: ts });
  });
  return out;
}

/** Tavily JSON API (used when TAVILY_API_KEY is set). */
async function tavily(query: string): Promise<WebResult[]> {
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: process.env.TAVILY_API_KEY, query, max_results: 8, search_depth: "basic" }),
  });
  if (!res.ok) throw new Error(`tavily http ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ title: string; url: string; content: string; published_date?: string }> };
  const ts = nowIso();
  return (data.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: r.content ?? "", timestamp: r.published_date || ts }));
}

/** Brave Search API. */
async function brave(query: string): Promise<WebResult[]> {
  const res = await fetchWithTimeout(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`, {
    headers: { "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`brave http ${res.status}`);
  const data = (await res.json()) as { web?: { results?: Array<{ title: string; url: string; description: string; age?: string }> } };
  const ts = nowIso();
  return (data.web?.results ?? []).map((r) => ({ title: r.title, url: r.url, snippet: stripTags(r.description ?? ""), timestamp: r.age || ts }));
}

/** Serper.dev Google API. */
async function serper(query: string): Promise<WebResult[]> {
  const res = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num: 8 }),
  });
  if (!res.ok) throw new Error(`serper http ${res.status}`);
  const data = (await res.json()) as { organic?: Array<{ title: string; link: string; snippet: string; date?: string }> };
  const ts = nowIso();
  return (data.organic ?? []).map((r) => ({ title: r.title, url: r.link, snippet: r.snippet ?? "", timestamp: r.date || ts }));
}

/* --------------------------------- entry --------------------------------- */

export interface WebSearchResult {
  results: WebResult[];
  provider: string;
  cached: boolean;
}

/**
 * Search the web for `query`. Returns ranked/trusted results (possibly empty).
 * Throws only on a hard provider failure — callers catch and fall back (Phase 8).
 */
export async function webSearch(query: string, limit = 5): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) return { results: [], provider: "none", cached: false };

  const cached = getCached(q);
  if (cached) return { results: cached, provider: activeProvider(), cached: true };

  const provider = activeProvider();
  const impl = provider === "tavily" ? tavily : provider === "brave" ? brave : provider === "serper" ? serper : duckduckgo;

  const raw = await impl(q);
  lastSearchAt = Date.now();
  const ranked = rankAndFilter(raw, limit);
  if (ranked.length) setCached(q, ranked);
  return { results: ranked, provider, cached: false };
}
