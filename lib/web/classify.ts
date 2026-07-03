/**
 * Phase 1 — query intent classification for the live-web layer.
 *
 * Splits a message into:
 *   - "internal": answer from the knowledge base / memory only (existing path).
 *   - "web":      answer from live web search only (current/real-time facts).
 *   - "hybrid":   internal facts are authoritative, web adds current/external info.
 *
 * DESIGN: purely additive. When it returns "internal" the chat route behaves
 * exactly as before (no web call). Only "web"/"hybrid" trigger the web layer.
 * A known internal entity (Haji, AllBee, Suplaykart, family, …) keeps a query
 * internal unless it explicitly asks for news/comparison/live external data — so
 * "Is Suplaykart currently open?" stays internal while "latest news about
 * Suplaykart" becomes hybrid.
 */
import { extractEntities } from "@/lib/ai/reference-resolution";

export type WebIntent = "internal" | "web" | "hybrid";

// Strong signals: real-time / external topics that clearly need the web.
const STRONG_WEB_RE =
  /\b(weather|temperature|forecast|rain|humidity|aqi|air quality|stock price|share price|stock market|sensex|nifty|price of|exchange rate|gold rate|silver rate|petrol price|diesel price|fuel price|news|breaking|headline|election|poll results?|vote count|points table|standings|scoreboard|scorecard|who won|match result|fixtures?|box office|trending|prime minister|chief minister|president of|governor of|\bcm of\b|\bpm of\b|as of (today|now|this))\b/i;

// Weak/temporal signals: only imply "web" when there is NO internal subject.
const WEAK_LIVE_RE =
  /\b(current|currently|latest|today|tonight|right now|this (week|month|year)|these days|nowadays|recent(ly)?|up to date|up-to-date|live)\b/i;

// When an internal entity IS present, these push it to hybrid (entity + world).
const HYBRID_HINT_RE =
  /\b(latest news|news about|in the news|compare|comparison|versus|\bvs\b|competitor|competitors|market|industry trend|trending)\b/i;

/** Classify a message into an internal / web / hybrid intent. */
export function classifyQuery(message: string): WebIntent {
  const lower = message.toLowerCase();
  const hasEntity = extractEntities(message).length > 0;
  const strong = STRONG_WEB_RE.test(lower);
  const weak = WEAK_LIVE_RE.test(lower);
  const hybridHint = HYBRID_HINT_RE.test(lower);

  if (hasEntity) {
    // Internal subject: only reach for the web on an explicit news/compare/live ask.
    return hybridHint || strong ? "hybrid" : "internal";
  }
  // No internal subject: any real-time/temporal signal → web.
  return strong || weak ? "web" : "internal";
}
