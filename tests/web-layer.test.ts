/** Live-web layer — classification, trusted-source ranking, cache (pure). */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyQuery } from "@/lib/web/classify";
import { rankAndFilter, tierOf, hostOf, type WebResult } from "@/lib/web/sources";
import { cacheKindFor, getCached, setCached, resetCache, TTL_MS } from "@/lib/web/cache";

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
