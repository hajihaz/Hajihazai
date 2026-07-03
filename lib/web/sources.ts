/**
 * Phase 3 — trusted-source tiers + ranking/filtering for web results.
 *
 * Government, established news, official finance/weather/sports sources rank
 * above general references; random blogs and low-quality hosts are filtered out.
 */

export interface WebResult {
  title: string;
  url: string;
  snippet: string;
  /** ISO timestamp the result was retrieved (DDG gives no publish date). */
  timestamp: string;
  /** Populated by rankAndFilter. */
  host?: string;
  tier?: number;
}

/** Host → tier. Lower tier = more trusted (sorted ascending). */
const TIERS: Array<{ tier: number; hosts: RegExp }> = [
  // Tier 0 — government / official
  { tier: 0, hosts: /(^|\.)(gov\.in|nic\.in|tn\.gov\.in|eci\.gov\.in|rbi\.org\.in|imd\.gov\.in|mea\.gov\.in|pib\.gov\.in)$/i },
  // Tier 1 — official finance / weather / sports exchanges & bodies
  { tier: 1, hosts: /(^|\.)(nseindia\.com|bseindia\.com|moneycontrol\.com|openweathermap\.org|accuweather\.com|icc-cricket\.com|iplt20\.com|fifa\.com|nba\.com)$/i },
  // Tier 2 — established news wires / mastheads
  { tier: 2, hosts: /(^|\.)(reuters\.com|thehindu\.com|indianexpress\.com|ptinews\.com|bbc\.com|bbc\.co\.uk|apnews\.com|ndtv\.com|livemint\.com|economictimes\.indiatimes\.com|business-standard\.com|timesofindia\.indiatimes\.com)$/i },
  // Tier 3 — reference (Wikipedia etc.)
  { tier: 3, hosts: /(^|\.)(wikipedia\.org|britannica\.com)$/i },
];

// Low-quality / spammy hosts to drop outright.
const BLOCKLIST = /(^|\.)(pinterest\.|quora\.com|answers\.com|blogspot\.|wordpress\.com|medium\.com|facebook\.com|reddit\.com|tiktok\.com|instagram\.com)/i;

const DEFAULT_TIER = 5;

export function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

export function tierOf(url: string): number {
  const host = hostOf(url);
  if (!host) return DEFAULT_TIER + 1;
  for (const { tier, hosts } of TIERS) if (hosts.test(host)) return tier;
  return DEFAULT_TIER;
}

/**
 * Drop blocklisted / empty results, annotate host + tier, and sort by trust
 * (tier ascending) preserving the provider's order within a tier. Returns the
 * top `limit`.
 */
export function rankAndFilter(results: WebResult[], limit = 5): WebResult[] {
  const cleaned = results
    .filter((r) => r.url && r.title && !BLOCKLIST.test(hostOf(r.url)))
    .map((r) => ({ ...r, host: hostOf(r.url), tier: tierOf(r.url) }));
  // stable sort by tier
  return cleaned
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r.tier! - b.r.tier!) || (a.i - b.i))
    .map(({ r }) => r)
    .slice(0, limit);
}
