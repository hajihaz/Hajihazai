/**
 * Phase 2 — web search layer. `webSearch(query)` returns ranked, trusted,
 * de-duplicated results ({title, url, snippet, timestamp}). Provider is chosen
 * from env at call time; falls back to a keyless DuckDuckGo HTML scrape so the
 * feature works with no configuration. Results are cached per-kind (Phase 6).
 *
 * A Groq API key is also sufficient: GPT-OSS browser_search is used as the
 * built-in live-search provider. Tavily / Brave / Serper remain optional upgrades.
 */
import { rankAndFilter, type WebResult } from "./sources";
import { getCached, setCached } from "./cache";

const FETCH_TIMEOUT_MS = 8_000;
const GROQ_BROWSER_TIMEOUT_MS = 20_000;
const GROQ_RETRY_DELAYS_MS = [750, 1_500] as const;

// Explicit freshness language must never be satisfied by an older cache entry.
// This is critical for questions like "current CM", "right now", or "refresh".
const FRESHNESS_BYPASS_RE = /\b(current|currently|right now|as of (today|now)|refresh|just now|live|latest|most recent|recent|recently)\b/i;

export function shouldBypassCache(query: string): boolean {
  return FRESHNESS_BYPASS_RE.test(query);
}

let lastSearchAt: number | null = null;

export function getLastSearchAt(): number | null {
  return lastSearchAt;
}

/** Test helper: clear in-process search state without exposing cache internals. */
export function resetWebSearchStateForTests(): void {
  lastSearchAt = null;
}

export function activeProvider():
  "tavily" | "brave" | "serper" | "groq-browser" | "duckduckgo" {
  if (process.env.TAVILY_API_KEY) return "tavily";
  if (process.env.BRAVE_SEARCH_API_KEY) return "brave";
  if (process.env.SERPER_API_KEY) return "serper";
  // Groq GPT-OSS has a server-side browser_search tool. This gives HajiHaz
  // production-grade live search without requiring a second search account.
  if (process.env.GROQ_API_KEY) return "groq-browser";
  return "duckduckgo";
}

/**
 * True when a production-grade live-search provider is configured. This includes
 * Groq GPT-OSS browser_search plus Tavily / Brave / Serper. The keyless
 * DuckDuckGo scraper is a dev/local convenience only.
 */
export function hasProductionGradeProvider(): boolean {
  return !!(
    process.env.TAVILY_API_KEY ||
    process.env.BRAVE_SEARCH_API_KEY ||
    process.env.SERPER_API_KEY ||
    process.env.GROQ_API_KEY
  );
}

/**
 * Whether the web layer may run in this environment: always in dev/preview
 * (keyless fallback is fine for testing); in production ONLY with a real
 * search API key. Without one, every query follows the existing internal path.
 */
export function isWebProviderReady(): boolean {
  return hasProductionGradeProvider() || process.env.NODE_ENV !== "production";
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const nowIso = () => new Date().toISOString();
const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();

/* ------------------------------- providers ------------------------------- */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

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
    const res = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": UA } },
    );
    if (res.ok) {
      const html = await res.text();
      const out: WebResult[] = [];
      const re =
        /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && out.length < 12) {
        const href = decodeDdgHref(m[1]);
        const title = stripTags(m[2]);
        if (href.startsWith("http") && title)
          out.push({
            title,
            url: href,
            snippet: stripTags(m[3]),
            timestamp: ts,
          });
      }
      if (out.length) return out;
    }
  } catch {
    /* fall through to lite */
  }

  // 2) lite.duckduckgo.com/lite — result-link anchors + result-snippet cells.
  const res = await fetchWithTimeout(
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`,
    { headers: { "User-Agent": UA } },
  );
  if (!res.ok) throw new Error(`ddg-lite http ${res.status}`);
  const html = await res.text();
  const out: WebResult[] = [];
  const links = [
    ...html.matchAll(
      /<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g,
    ),
  ];
  const snips = [
    ...html.matchAll(/<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/g),
  ].map((s) => stripTags(s[1]));
  links.forEach((l, i) => {
    const href = decodeDdgHref(l[1]);
    const title = stripTags(l[2]);
    if (href.startsWith("http") && title && out.length < 12)
      out.push({ title, url: href, snippet: snips[i] ?? "", timestamp: ts });
  });
  return out;
}

/**
 * Google News RSS fallback. This is intentionally keyless and used only when the
 * primary provider/fallback path cannot produce evidence. RSS search results carry
 * the publisher URL + publication time, which gives the verification gate a useful
 * independent source even during provider rate limits.
 */
async function googleNewsRss(query: string): Promise<WebResult[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) throw new Error(`google-news-rss http ${res.status}`);
  const xml = await res.text();
  const out: WebResult[] = [];
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  const decode = (value: string) => value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
  for (const item of items.slice(0, 10)) {
    const body = item[1];
    const title = decode(body.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    const pubDate = decode(body.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] ?? "");
    const sourceMatch = body.match(/<source[^>]*url="([^"]+)"[^>]*>([\s\S]*?)<\/source>/i);
    const sourceUrl = decode(sourceMatch?.[1] ?? "");
    const sourceName = decode(sourceMatch?.[2] ?? "");
    if (!title || !sourceUrl) continue;
    const evidence = `${title} — ${sourceName || new URL(sourceUrl).hostname}${pubDate ? ` — published ${pubDate}` : ""}`;
    out.push({
      title,
      url: sourceUrl,
      snippet: evidence,
      timestamp: pubDate || nowIso(),
    });
  }
  return out;
}

/** Tavily JSON API (used when TAVILY_API_KEY is set). */
async function tavily(query: string): Promise<WebResult[]> {
  const res = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: process.env.TAVILY_API_KEY,
      query,
      max_results: 8,
      search_depth: "basic",
    }),
  });
  if (!res.ok) throw new Error(`tavily http ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      title: string;
      url: string;
      content: string;
      published_date?: string;
    }>;
  };
  const ts = nowIso();
  return (data.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content ?? "",
    timestamp: r.published_date || ts,
  }));
}

/** Brave Search API. */
async function brave(query: string): Promise<WebResult[]> {
  const res = await fetchWithTimeout(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`,
    {
      headers: {
        "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY!,
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) throw new Error(`brave http ${res.status}`);
  const data = (await res.json()) as {
    web?: {
      results?: Array<{
        title: string;
        url: string;
        description: string;
        age?: string;
      }>;
    };
  };
  const ts = nowIso();
  return (data.web?.results ?? []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: stripTags(r.description ?? ""),
    timestamp: r.age || ts,
  }));
}

/**
 * Groq GPT-OSS server-side browser search. Use GPT-OSS 20B by default because it
 * is the currently supported browser-search path with lower latency/cost. Operators
 * can opt into the 120B browser-search model with GROQ_WEB_MODEL when capacity is available.
 * answer is used only as supplemental evidence when it contains citations; the
 * actual source pages remain the primary evidence.
 */
async function groqBrowserSearch(query: string): Promise<WebResult[]> {
  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_WEB_MODEL || "openai/gpt-oss-20b",
        messages: [
          {
            role: "user",
            content: `Use browser search to research this query. Do not answer from memory. Search for authoritative and recent sources, especially official government or primary sources when applicable: ${query}`,
          },
        ],
        temperature: 1,
        max_completion_tokens: 1200,
        reasoning_effort: "low",
        stream: false,
        tool_choice: "required",
        tools: [{ type: "browser_search" }],
      }),
    },
    GROQ_BROWSER_TIMEOUT_MS,
  );
  if (!res.ok) throw new Error(`groq-browser http ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        executed_tools?: Array<{
          type?: string;
          search_results?: {
            results?: Array<{
              title?: string;
              url?: string;
              content?: string;
              score?: number;
            }>;
          };
        }>;
      };
    }>;
  };
  const tools = data.choices?.[0]?.message?.executed_tools ?? [];
  const byUrl = new Map<string, WebResult>();
  const ts = nowIso();
  for (const tool of tools) {
    if (tool.type === "browser_search") {
      for (const r of tool.search_results?.results ?? []) {
        if (!r.url || !r.title) continue;
        byUrl.set(r.url, {
          title: r.title,
          url: r.url,
          snippet: r.content ?? "",
          timestamp: ts,
        });
      }
    }

    // Browser search may return a result list whose content is empty while the
    // model subsequently opens the most relevant pages. Preserve that opened
    // page text as evidence for the final HajiHaz model instead of trusting the
    // browser-search model's generated answer.
    if (
      tool.type === "browser.open" &&
      typeof (tool as { output?: unknown }).output === "string"
    ) {
      const output = (tool as { output: string }).output;
      const urlMatch = output.match(/URL:\s*(https?:\/\/[^\s]+)/);
      if (!urlMatch) continue;
      const url = urlMatch[1];
      const existing = byUrl.get(url);
      const body = output
        .replace(/^[\s\S]*?URL:\s*https?:\/\/[^\n]+\n?/, "")
        .trim();
      if (existing) {
        existing.snippet = body.slice(0, 5000) || existing.snippet;
      } else {
        const firstHeading =
          body
            .split("\n")
            .map((x) => x.replace(/^L\d+:\s*/, "").trim())
            .find(Boolean) ?? url;
        byUrl.set(url, {
          title: firstHeading.slice(0, 240),
          url,
          snippet: body.slice(0, 5000),
          timestamp: ts,
        });
      }
    }
  }

  // The browser model returns a synthesized answer with citation markers. Keep
  // it only as supplemental evidence when we also have at least one opened
  // source page; never create a synthetic source from the model alone.
  const generated = data.choices?.[0]?.message?.content?.trim() ?? "";
  if (generated.length >= 40 && /【\d+†L\d+[-–]?\d*】/.test(generated)) {
    const first = [...byUrl.values()].find((r) => r.snippet.length >= 40);
    if (first) first.snippet = `${generated}\n\nSOURCE PAGE EVIDENCE:\n${first.snippet}`.slice(0, 5000);
  }
  return [...byUrl.values()];
}

/** Serper.dev Google API. */
async function serper(query: string): Promise<WebResult[]> {
  const res = await fetchWithTimeout("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num: 8 }),
  });
  if (!res.ok) throw new Error(`serper http ${res.status}`);
  const data = (await res.json()) as {
    organic?: Array<{
      title: string;
      link: string;
      snippet: string;
      date?: string;
    }>;
  };
  const ts = nowIso();
  return (data.organic ?? []).map((r) => ({
    title: r.title,
    url: r.link,
    snippet: r.snippet ?? "",
    timestamp: r.date || ts,
  }));
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
export async function webSearch(
  query: string,
  limit = 5,
): Promise<WebSearchResult> {
  const q = query.trim();
  if (!q) return { results: [], provider: "none", cached: false };

  const bypassCache = shouldBypassCache(q);
  const cached = bypassCache ? null : getCached(q);
  if (cached)
    return { results: cached, provider: activeProvider(), cached: true };

  const provider = activeProvider();
  const impl =
    provider === "tavily"
      ? tavily
      : provider === "brave"
        ? brave
        : provider === "serper"
          ? serper
          : provider === "groq-browser"
            ? groqBrowserSearch
            : duckduckgo;

  let raw: WebResult[] = [];
  let effectiveProvider: string = provider;
  let lastError: unknown;
  const attempts = provider === "groq-browser" ? GROQ_RETRY_DELAYS_MS.length + 1 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      raw = await impl(q);
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      const status = error instanceof Error ? /http (\d{3})/.exec(error.message)?.[1] : undefined;
      const retryable = provider === "groq-browser" && (status === "429" || status === "500" || status === "502" || status === "503" || status === "504");
      if (!retryable || attempt >= attempts - 1) break;
      await new Promise((resolve) => setTimeout(resolve, GROQ_RETRY_DELAYS_MS[attempt]));
    }
  }
  if (lastError) {
    // In production, never downgrade a real provider failure to keyless scraping.
    // Current-event verification must either use a configured production-grade
    // provider or return no evidence and let the caller refuse.
    if (process.env.NODE_ENV === "production") throw lastError;
    const error = lastError;
    if (provider !== "groq-browser") throw error;
    console.warn("[web] groq-browser failed in non-production; trying DuckDuckGo fallback:", error);
    try {
      raw = await duckduckgo(q);
      effectiveProvider = "duckduckgo-fallback";
      try {
        const rss = await googleNewsRss(q);
        raw = [...raw, ...rss];
      } catch (rssError) {
        console.warn("[web] Google News RSS supplement failed:", rssError);
      }
    } catch (fallbackError) {
      console.warn("[web] DuckDuckGo fallback failed; trying Google News RSS:", fallbackError);
      raw = await googleNewsRss(q);
      effectiveProvider = "google-news-rss-fallback";
    }
  }

  // A search result without readable evidence is not verification. Keyless
  // fallback is intentionally limited to non-production environments.
  let evidence = raw.filter((r) => r.snippet.trim().length >= 40);
  if (!evidence.length && provider === "groq-browser" && process.env.NODE_ENV !== "production") {
    try {
      const fallback = await duckduckgo(q);
      evidence = fallback.filter((r) => r.snippet.trim().length >= 40);
      if (evidence.length) effectiveProvider = "duckduckgo-fallback";
    } catch (error) {
      console.warn("[web] DuckDuckGo fallback failed; trying Google News RSS:", error);
      try {
        const rss = await googleNewsRss(q);
        evidence = rss.filter((r) => r.snippet.trim().length >= 40);
        if (evidence.length) effectiveProvider = "google-news-rss-fallback";
      } catch (rssError) {
        console.warn("[web] Google News RSS fallback failed:", rssError);
      }
    }
  }
  lastSearchAt = Date.now();
  const ranked = rankAndFilter(evidence, limit);
  if (ranked.length) setCached(q, ranked);
  return { results: ranked, provider: effectiveProvider, cached: false };
}

/**
 * Research fan-out: run a small set of independent queries in parallel, then
 * deduplicate by URL and apply the same trust ranking used by single search.
 * A failed branch is isolated so one provider hiccup cannot erase good evidence.
 */
export async function webSearchMany(
  queries: string[],
  limit = 5,
  maxParallel = 2,
): Promise<WebSearchResult> {
  const unique = [
    ...new Set(queries.map((q) => q.trim()).filter(Boolean)),
  ].slice(0, 3);
  if (unique.length === 0)
    return { results: [], provider: "none", cached: false };

  const concurrency = Math.max(1, Math.min(Math.floor(maxParallel), unique.length));
  const settled: PromiseSettledResult<WebSearchResult>[] = [];
  for (let i = 0; i < unique.length; i += concurrency) {
    const batch = unique.slice(i, i + concurrency);
    settled.push(...await Promise.allSettled(batch.map((q) => webSearch(q, limit))));
  }
  const byUrl = new Map<string, WebResult>();
  let provider = "none";
  let cached = true;
  for (const result of settled) {
    if (result.status !== "fulfilled") continue;
    provider = result.value.provider;
    cached = cached && result.value.cached;
    for (const item of result.value.results) {
      const existing = byUrl.get(item.url);
      // Keep the richer evidence when two formulations return the same page.
      if (!existing || item.snippet.length > existing.snippet.length)
        byUrl.set(item.url, item);
    }
  }

  const ranked = rankAndFilter([...byUrl.values()], Math.max(limit, limit * 2));
  return { results: ranked.slice(0, limit), provider, cached };
}
