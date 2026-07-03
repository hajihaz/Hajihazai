/**
 * Phase 6 — in-process TTL cache for web results (mirrors the in-memory pattern
 * used by system-settings + ratelimit). Per-kind TTLs:
 *   stocks 5m · news 15m · weather 15m · government positions 24h · default 30m.
 *
 * Note: per-instance (serverless). Good enough to avoid repeated searches within
 * a warm instance; swap for a shared KV to go multi-instance.
 */
import type { WebResult } from "./sources";

export type CacheKind = "stocks" | "news" | "weather" | "gov" | "default";

export const TTL_MS: Record<CacheKind, number> = {
  stocks: 5 * 60_000,
  news: 15 * 60_000,
  weather: 15 * 60_000,
  gov: 24 * 60 * 60_000,
  default: 30 * 60_000,
};

/** Pick a cache kind (and thus TTL) from the query text. */
export function cacheKindFor(query: string): CacheKind {
  const q = query.toLowerCase();
  if (/\b(stock|share price|sensex|nifty|price of|exchange rate|gold rate|petrol|diesel|fuel price)\b/.test(q)) return "stocks";
  if (/\b(weather|temperature|forecast|rain|humidity|aqi|air quality)\b/.test(q)) return "weather";
  if (/\b(prime minister|chief minister|president of|governor of|election|cabinet|\bcm\b|\bpm\b)\b/.test(q)) return "gov";
  if (/\b(news|breaking|headline|latest|today|score|points table|result)\b/.test(q)) return "news";
  return "default";
}

interface Entry { value: WebResult[]; expiresAt: number; kind: CacheKind }
const STORE = new Map<string, Entry>();
let hits = 0, misses = 0;

const keyFor = (query: string) => query.trim().toLowerCase();

export function getCached(query: string, now = Date.now()): WebResult[] | null {
  const e = STORE.get(keyFor(query));
  if (e && e.expiresAt > now) { hits++; return e.value; }
  if (e) STORE.delete(keyFor(query)); // expired
  misses++;
  return null;
}

export function setCached(query: string, value: WebResult[], now = Date.now()): void {
  const kind = cacheKindFor(query);
  STORE.set(keyFor(query), { value, kind, expiresAt: now + TTL_MS[kind] });
}

export function cacheStats(now = Date.now()) {
  let live = 0;
  const byKind: Record<string, number> = {};
  for (const e of STORE.values()) {
    if (e.expiresAt > now) { live++; byKind[e.kind] = (byKind[e.kind] ?? 0) + 1; }
  }
  const total = hits + misses;
  return { entries: live, hits, misses, hitRate: total ? hits / total : 0, byKind };
}

/** Test helper. */
export function resetCache(): void { STORE.clear(); hits = 0; misses = 0; }
