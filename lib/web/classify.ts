/**
 * Phase 1 — query intent classification for the live-web layer.
 *
 * Splits a message into:
 *   - "internal": answer from the knowledge base / memory only (existing path).
 *   - "web":      answer from live web search only (current/real-time facts). MUST
 *                 be verified — see lib/web/verify.ts. If verification fails the
 *                 chat route refuses instead of guessing.
 *   - "hybrid":   internal facts are authoritative, web adds current/external info.
 *   - "website":  the user pointed at a specific site ("summarize xyz.com"); the
 *                 route fetches the page and summarizes ONLY the fetched content.
 *
 * DESIGN: additive for "internal" (chat behaves exactly as before). "web",
 * "hybrid", and "website" all require a successful live lookup before the model
 * is allowed to answer the live/external part of the question.
 *
 * A known internal entity (Haji, AllBee, Suplaykart, family, …) keeps a query
 * internal unless it explicitly asks for news/comparison/live external data — so
 * "Is Suplaykart currently open?" stays internal while "latest news about
 * Suplaykart" becomes hybrid.
 */
import { extractEntities } from "@/lib/ai/reference-resolution";

export type WebIntent = "internal" | "web" | "hybrid" | "website";

/* --------------------------- URL / website detection --------------------------- */

/** Explicit http(s) URL anywhere in the message. */
const URL_RE = /\bhttps?:\/\/[^\s<>()]+/i;

/**
 * Bare domain (no scheme), e.g. `rknassociates.com`, `foo.co.in`. The final label
 * must be a known-ish TLD so we don't match version numbers ("v2.0"), file names
 * ("index.ts"), or abbreviations ("i.e"). Kept deliberately conservative.
 */
const BARE_DOMAIN_RE =
  /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|ai|co|in|edu|gov|dev|app|xyz|info|biz|me|us|uk|store|online|tech|site|news|blog|shop|agency|company|world|life|link|page|website))\b/i;

/** Verbs that mean "go look at this website and tell me about it". */
const WEBSITE_VERB_RE =
  /\b(summar(y|ize|ise)|analy(z|s)e|review|describe|overview|explain|tell me about|what (is|does|are)|who (is|are)|check (out)?|look at|visit|read|open|scrape|fetch|go to|explore)\b/i;

/**
 * Extract a fetchable URL from the message, or null. Prepends https:// to bare
 * domains. Ignores anything that looks like an email address.
 */
export function extractUrl(message: string): string | null {
  const u = URL_RE.exec(message);
  if (u) return u[0].replace(/[).,;'"]+$/, "");

  const d = BARE_DOMAIN_RE.exec(message);
  if (d) {
    const idx = d.index;
    // Not part of an email (user@domain) or a longer token.
    if (idx > 0 && /[@\w]/.test(message[idx - 1])) return null;
    return "https://" + d[1];
  }
  return null;
}

/* ------------------------------ live-fact signals ------------------------------ */

// Strong signals: real-time / external topics that clearly need the web.
// (Expanded per Rule #6 — office-holders, ownership, rankings, sports, markets.)
const STRONG_WEB_RE =
  /\b(weather|temperature|forecast|rain|humidity|aqi|air quality|stock price|share price|stock market|sensex|nifty|price of|exchange rate|gold rate|silver rate|petrol price|diesel price|fuel price|crude|crypto|bitcoin|ethereum|market cap|news|breaking|headline|election|poll results?|vote count|points table|standings|scoreboard|scorecard|who won|who is winning|winner of|champion|title holder|match result|fixtures?|box office|trending|prime minister|chief minister|president of|governor of|\bcm of\b|\bpm of\b|minister of|cabinet|mayor of|chief justice|ceo of|md of|managing director of|chairman of|owner of|ownership of|acquired by|merger|net worth of|richest|ranking of|ranked|top \d+|latest version|release date|launch date|released|as of (today|now|this))\b/i;

// Weak/temporal signals: only imply "web" when there is NO internal subject.
const WEAK_LIVE_RE =
  /\b(current|currently|latest|today|tonight|right now|this (week|month|year)|these days|nowadays|recent(ly)?|up to date|up-to-date|live|now)\b/i;

/**
 * Identity questions ("who is / who was <X>", "how old is <X>"). Public-figure
 * identities are frequently wrong or stale in model memory (e.g. "Thalapathy"),
 * so — with no internal subject — they must be verified live (Rule #6).
 * Excludes self/second-person ("who are you", "who am I").
 */
const IDENTITY_RE =
  /\b(who\s+(?:is|was|are|were)\s+(?!you\b|u\b|i\b|we\b|they\b|this\b|that\b|it\b)[a-z]|how old is|date of birth of|born in|net worth of)/i;

// When an internal entity IS present, these push it to hybrid (entity + world).
const HYBRID_HINT_RE =
  /\b(latest news|news about|in the news|compare|comparison|versus|\bvs\b|competitor|competitors|market|industry trend|trending|stock|share price|valuation|funding|acquired)\b/i;

/** Classify a message into an internal / web / hybrid / website intent. */
export function classifyQuery(message: string): WebIntent {
  const lower = message.toLowerCase();

  // (1) Website intent — an external URL/domain plus a "look at this site" ask,
  // or a message that is essentially just the URL. Highest priority: a concrete
  // page beats keyword heuristics.
  const url = extractUrl(message);
  if (url) {
    const withoutUrl = lower.replace(URL_RE, " ").replace(BARE_DOMAIN_RE, " ").replace(/\s+/g, " ").trim();
    const wantsSite = WEBSITE_VERB_RE.test(lower) || withoutUrl.length <= 6;
    if (wantsSite) return "website";
  }

  const hasEntity = extractEntities(message).length > 0;
  const strong = STRONG_WEB_RE.test(lower);
  const weak = WEAK_LIVE_RE.test(lower);
  const identity = IDENTITY_RE.test(lower);
  const hybridHint = HYBRID_HINT_RE.test(lower);

  if (hasEntity) {
    // Internal subject: only reach for the web on an explicit news/compare/live ask.
    return hybridHint || strong ? "hybrid" : "internal";
  }
  // No internal subject: any real-time/temporal/identity signal → web (verify).
  return strong || weak || identity ? "web" : "internal";
}

/**
 * Whether an intent requires a successful live lookup before the model may answer
 * the live/external part of the question. "internal" never does; "hybrid" answers
 * from authoritative internal facts even if the web part fails (with a disclaimer),
 * so it is not itself blocking.
 */
export function requiresLiveVerification(intent: WebIntent): boolean {
  return intent === "web" || intent === "website";
}
