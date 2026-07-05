/**
 * Website fetch + readable-text extraction for "summarize <url>" (Rule #3).
 *
 * A direct server-side fetch — NO search-provider key required, so website
 * summarization works in every environment. The result is the ACTUAL page text;
 * the chat route summarizes only what is returned here and refuses if this fails,
 * so a site summary can never be fabricated.
 *
 * Safety:
 *   - SSRF guard: rejects non-http(s) schemes and private/loopback/link-local
 *     hosts, including a redirect that lands on an internal host (checked on the
 *     FINAL url too).
 *   - Timeout + response-size cap.
 *   - Never throws — every failure returns { ok:false, reason } so the caller can
 *     refuse cleanly.
 */

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 3_000_000; // 3 MB hard cap on the downloaded HTML
const MAX_TEXT_CHARS = 12_000; // extracted text handed to the model
const UA = "Mozilla/5.0 (compatible; HajiHazAI/1.0; +https://hajihazai.com)";

export interface WebsiteContent {
  ok: true;
  /** The URL we were asked to fetch (normalized). */
  url: string;
  /** The URL actually fetched after redirects. */
  finalUrl: string;
  title: string;
  text: string;
}
export interface WebsiteError {
  ok: false;
  reason: string;
}
export type WebsiteFetchResult = WebsiteContent | WebsiteError;

/** Loopback / private / link-local / metadata hosts we must never fetch. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "metadata.google.internal") return true;
  // IPv6 loopback / unspecified.
  if (h === "::1" || h === "::") return true;
  // IPv4 literal ranges.
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 0 || a === 10) return true; // loopback / this-host / private
    if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  }
  return false;
}

/**
 * Validate + normalize a raw URL/domain into a fetchable https(s) URL, or return
 * null if it is malformed or points at a blocked host.
 */
export function normalizeUrl(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let u: URL | null = null;
  try {
    // Parse as-is FIRST, so an explicit non-http(s) scheme (ftp:, file:,
    // javascript:, …) is rejected below rather than silently re-prefixed.
    u = new URL(s);
  } catch {
    u = null;
  }
  if (!u) {
    // No scheme — treat as a bare domain/path.
    try {
      u = new URL("https://" + s);
    } catch {
      return null;
    }
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (isBlockedHost(u.hostname)) return null;
  return u.toString();
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, " ");
const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** Extract a page title + visible body text from raw HTML. */
export function htmlToText(html: string): { title: string; text: string } {
  const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleM ? decode(stripTags(titleM[1])).replace(/\s+/g, " ").trim().slice(0, 200) : "";

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const bodyM = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(body);
  if (bodyM) body = bodyM[1];

  const text = decode(stripTags(body)).replace(/\s+/g, " ").trim();
  return { title, text };
}

/**
 * Fetch a website and return its extracted text, or a reason it could not be
 * read. Never throws.
 */
export async function fetchWebsite(rawUrl: string): Promise<WebsiteFetchResult> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, reason: "the address is invalid or points to a non-public host" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5" },
    });

    // A redirect may have landed on an internal host — re-check the final URL.
    try {
      if (res.url && isBlockedHost(new URL(res.url).hostname)) {
        return { ok: false, reason: "the site redirected to a non-public host" };
      }
    } catch {
      /* keep the original url below */
    }

    if (!res.ok) return { ok: false, reason: `the server responded ${res.status}` };

    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ctype && !/(text\/html|application\/xhtml|text\/plain|application\/xml)/.test(ctype)) {
      return { ok: false, reason: `the page is not readable text (content-type: ${ctype.split(";")[0]})` };
    }

    let html = await res.text();
    if (html.length > MAX_BYTES) html = html.slice(0, MAX_BYTES);

    const { title, text } = htmlToText(html);
    if (text.replace(/\s/g, "").length < 30) {
      return { ok: false, reason: "the page returned no readable text (it may be JavaScript-rendered or empty)" };
    }

    return {
      ok: true,
      url,
      finalUrl: res.url || url,
      title,
      text: text.slice(0, MAX_TEXT_CHARS),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { ok: false, reason: isAbort ? "the request timed out" : `the fetch failed (${msg})` };
  } finally {
    clearTimeout(timer);
  }
}
