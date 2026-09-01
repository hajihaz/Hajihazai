/** Live-web layer — classification, trusted-source ranking, cache (pure). */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { classifyQuery } from "@/lib/web/classify";
import { rankAndFilter, tierOf, hostOf, type WebResult } from "@/lib/web/sources";
import { cacheKindFor, getCached, setCached, resetCache, TTL_MS } from "@/lib/web/cache";
import { hasProductionGradeProvider, activeProvider, shouldBypassCache } from "@/lib/web/search";

describe("classifyQuery", () => {
  it("routes live/real-time questions to web", () => {
    for (const q of [
      "Who is the current Chief Minister of Tamil Nadu?",
      "Current Prime Minister of India?",
      "Reliance share price?",
      "Today's weather in Chennai?",
      "Latest IPL points table?",
      "Latest OpenAI news?",
    ]) expect(classifyQuery(q)).toBe("web");
  });

  it("keeps internal-entity questions internal", () => {
    for (const q of ["Who is Haji?", "Who founded AllBee?", "What is Suplaykart?", "Who is Safina?"])
      expect(classifyQuery(q)).toBe("internal");
  });

  it("keeps an internal entity + weak temporal word internal (no over-trigger)", () => {
    expect(classifyQuery("Is Suplaykart currently open?")).toBe("internal");
    expect(classifyQuery("What is Haji's current goal?")).toBe("internal");
  });

  it("uses hybrid for internal entity + news/compare", () => {
    expect(classifyQuery("What is the latest news about Suplaykart?")).toBe("hybrid");
    expect(classifyQuery("How does Haji's business compare with Zepto?")).toBe("hybrid");
    expect(classifyQuery("Compare AllBee with current web design agencies.")).toBe("hybrid");
  });
});

describe("trusted sources", () => {
  const R = (url: string): WebResult => ({ title: "t", url, snippet: "s", timestamp: "" });
  it("ranks government above news above reference, drops blocklisted", () => {
    const ranked = rankAndFilter([
      R("https://en.wikipedia.org/wiki/x"),
      R("https://www.reddit.com/r/x"),      // blocklisted
      R("https://tn.gov.in/minister"),      // gov, tier 0
      R("https://www.thehindu.com/news/x"), // news, tier 2
    ]);
    expect(ranked.map((r) => r.host)).toEqual(["tn.gov.in", "thehindu.com", "en.wikipedia.org"]);
    expect(ranked.some((r) => r.host === "reddit.com")).toBe(false);
  });
  it("tiers gov=0, finance/weather=1, news=2, reference=3, other high", () => {
    expect(tierOf("https://pmindia.gov.in")).toBe(0);
    expect(tierOf("https://moneycontrol.com/x")).toBe(1);
    expect(tierOf("https://reuters.com/x")).toBe(2);
    expect(tierOf("https://en.wikipedia.org/x")).toBe(3);
    expect(tierOf("https://random-blog.xyz/x")).toBeGreaterThan(3);
  });
  it("hostOf strips www", () => {
    expect(hostOf("https://www.thehindu.com/a")).toBe("thehindu.com");
  });
});

describe("production provider gate", () => {
  const saved = { t: process.env.TAVILY_API_KEY, b: process.env.BRAVE_SEARCH_API_KEY, s: process.env.SERPER_API_KEY };
  afterEach(() => {
    if (saved.t === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = saved.t;
    if (saved.b === undefined) delete process.env.BRAVE_SEARCH_API_KEY; else process.env.BRAVE_SEARCH_API_KEY = saved.b;
    if (saved.s === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = saved.s;
  });
  it("keyless → not production-grade, provider is duckduckgo", () => {
    delete process.env.TAVILY_API_KEY; delete process.env.BRAVE_SEARCH_API_KEY; delete process.env.SERPER_API_KEY; delete process.env.GROQ_API_KEY;
    expect(hasProductionGradeProvider()).toBe(false);
    expect(activeProvider()).toBe("duckduckgo");
  });
  it("any API key → production-grade", () => {
    process.env.TAVILY_API_KEY = "test-key";
    expect(hasProductionGradeProvider()).toBe(true);
    expect(activeProvider()).toBe("tavily");
  });
});

describe("Groq browser transient retry", () => {
  it("retries transient 429/5xx failures before surfacing fallback", async () => {
    const src = await import("@/lib/web/search");
    const originalFetch = globalThis.fetch;
    const originalKey = process.env.GROQ_API_KEY;
    let calls = 0;
    try {
      process.env.GROQ_API_KEY = "test-key";
      globalThis.fetch = (async () => {
        calls++;
        if (calls < 3) return new Response("rate limited", { status: 429 });
        return new Response(JSON.stringify({
          choices: [{ message: { executed_tools: [{ type: "browser_search", search_results: { results: [{ title: "TN Government", url: "https://tn.gov.in/cm", content: "Official government evidence with enough readable text for verification." }] } }] } }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }) as typeof fetch;
      src.resetWebSearchStateForTests();
      const r = await src.webSearch("retry test current fact", 3);
      expect(calls).toBe(3);
      expect(r.provider).toBe("groq-browser");
      expect(r.results).toHaveLength(1);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = originalKey;
      src.resetWebSearchStateForTests();
    }
  });
});

describe("freshness cache bypass", () => {
  it("bypasses cache for explicit current/refresh language", () => {
    expect(shouldBypassCache("current Chief Minister of Tamil Nadu")).toBe(true);
    expect(shouldBypassCache("refresh latest news now")).toBe(true);
    expect(shouldBypassCache("latest Supreme Court judgment")).toBe(true);
    expect(shouldBypassCache("recent RBI policy update")).toBe(true);
    expect(shouldBypassCache("Who founded AllBee?")).toBe(false);
  });
});

describe("cache", () => {
  beforeEach(() => resetCache());
  it("picks TTL kind from the query", () => {
    expect(cacheKindFor("reliance share price")).toBe("stocks");
    expect(cacheKindFor("weather in chennai")).toBe("weather");
    expect(cacheKindFor("current chief minister")).toBe("gov");
    expect(cacheKindFor("latest news")).toBe("news");
    expect(cacheKindFor("something else")).toBe("default");
    expect(TTL_MS.stocks).toBeLessThan(TTL_MS.gov);
  });
  it("stores and retrieves within TTL, expires after", () => {
    const now = 1_000_000;
    setCached("weather in chennai", [{ title: "t", url: "u", snippet: "s", timestamp: "" }], now);
    expect(getCached("weather in chennai", now + 60_000)).toHaveLength(1); // within 15m
    expect(getCached("weather in chennai", now + TTL_MS.weather + 1)).toBeNull(); // expired
  });
  it("is case-insensitive on the key", () => {
    setCached("Reliance Share Price", [{ title: "t", url: "u", snippet: "s", timestamp: "" }], 0);
    expect(getCached("reliance share price", 1000)).toHaveLength(1);
  });
});
