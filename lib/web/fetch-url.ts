import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent, interceptors } from "undici";
import type { Dispatcher } from "undici";

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
function ipv4ToBigInt(value: string): bigint | null {
  const parts = value.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => n < 0 || n > 255)) return null;
  return (BigInt(nums[0]) << 24n) | (BigInt(nums[1]) << 16n) | (BigInt(nums[2]) << 8n) | BigInt(nums[3]);
}

function ipv6ToBigInt(value: string): bigint | null {
  let h = value.toLowerCase();
  const mapped = h.lastIndexOf("::ffff:");
  if (mapped === 0 && h.includes(".")) {
    const v4 = ipv4ToBigInt(h.slice(7));
    return v4 === null ? null : (0xffffn << 32n) | v4;
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const parse = (parts: string[]) => parts.map((part) => (/^[0-9a-f]{1,4}$/.test(part) ? parseInt(part, 16) : -1));
  const l = parse(left);
  const r = parse(right);
  if (l.includes(-1) || r.includes(-1)) return null;
  const missing = 8 - l.length - r.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...l, ...Array(Math.max(0, missing)).fill(0), ...r];
  if (groups.length !== 8) return null;
  return groups.reduce((acc, group) => (acc << 16n) | BigInt(group), 0n);
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(normalized) === 4) {
    const n = ipv4ToBigInt(normalized);
    if (n === null) return true;
    const a = Number((n >> 24n) & 255n);
    const b = Number((n >> 16n) & 255n);
    // RFC1918, loopback, unspecified, link-local, CGNAT, documentation/reserved
    // and multicast/broadcast ranges are all unsuitable SSRF destinations.
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(normalized) === 6) {
    const n = ipv6ToBigInt(normalized);
    if (n === null) return true;
    const first = Number((n >> 120n) & 255n);
    const second = Number((n >> 112n) & 255n);
    const mappedV4 = n >> 32n;
    // ::/128, ::1/128, IPv4-mapped IPv6, ULA, link-local and multicast.
    return (
      n === 0n ||
      n === 1n ||
      mappedV4 === 0xffffn ||
      (first & 0xfe) === 0xfc ||
      (first === 0xfe && (second & 0xc0) === 0x80) ||
      first >= 0xff
    );
  }
  return true;
}

/** Reject local/private destinations, including IPv4-mapped IPv6 and DNS names resolving internally. */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;
  if (h === "metadata.google.internal") return true;
  return isIP(h) > 0 ? isPrivateIp(h) : false;
}

/**
 * Resolve a hostname once and return the exact public address to which this
 * request must connect. Pinning this answer into the HTTP client's DNS lookup
 * closes the validation→connection DNS-rebinding window.
 */
async function resolvePublicDestination(url: string): Promise<{ address: string; family: 4 | 6 }> {
  const hostname = new URL(url).hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHost(hostname)) throw new Error("the destination is not public");
  const family = isIP(hostname);
  if (family === 4 || family === 6) return { address: hostname, family };

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("the destination resolves to a non-public host");
  }
  const preferred = addresses.find(({ family }) => family === 4) ?? addresses[0];
  if (preferred.family !== 4 && preferred.family !== 6) {
    throw new Error("the destination resolved to an unsupported address family");
  }
  return { address: preferred.address, family: preferred.family };
}

/**
 * Create a dispatcher whose DNS lookup can only return the already-validated
 * address. The original hostname remains the TLS SNI/Host name.
 */
function createPinnedDispatcher(pinned: { address: string; family: 4 | 6 }): Dispatcher {
  return new Agent().compose(
    interceptors.dns({
      dualStack: false,
      affinity: pinned.family,
      maxTTL: 0,
      lookup: (_origin, _options, callback) => {
        callback(null, [{ address: pinned.address, family: pinned.family, ttl: 0 }]);
      },
    }),
  );
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
  let url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, reason: "the address is invalid or points to a non-public host" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      const pinned = await resolvePublicDestination(url);
      const dispatcher = createPinnedDispatcher(pinned);
      let res: Response;
      try {
        const fetchInit = {
          signal: ctrl.signal,
          redirect: "manual" as const,
          dispatcher,
          headers: {
            "User-Agent": UA,
            Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
          },
        } as RequestInit & { dispatcher: Dispatcher };
        res = await fetch(url, fetchInit);
      } catch (err) {
        await dispatcher.close().catch(() => undefined);
        throw err;
      }

      try {
        if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) return { ok: false, reason: "the site returned an invalid redirect" };
        const nextUrl = normalizeUrl(new URL(location, url).toString());
        if (!nextUrl) return { ok: false, reason: "the site redirected to a non-public host" };
        url = nextUrl;
        if (redirects === 5) return { ok: false, reason: "too many redirects" };
        continue;
      }

      // Re-check the URL returned by the server before accepting the body.
      if (res.url) {
        const finalUrl = normalizeUrl(res.url);
        if (!finalUrl) return { ok: false, reason: "the site redirected to a non-public host" };
        url = finalUrl;
      }

      if (!res.ok) return { ok: false, reason: `the server responded ${res.status}` };

      const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
      if (ctype && !/(text\/html|application\/xhtml|text\/plain|application\/xml)/.test(ctype)) {
        return { ok: false, reason: `the page is not readable text (content-type: ${ctype.split(";")[0]})` };
      }

      const declaredLength = Number(res.headers.get("content-length") ?? "0");
      if (declaredLength > MAX_BYTES) {
        return { ok: false, reason: "the page is too large to read" };
      }

      if (!res.body) return { ok: false, reason: "the server returned an empty body" };
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > MAX_BYTES) {
            await reader.cancel();
            return { ok: false, reason: "the page is too large to read" };
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }

      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const html = new TextDecoder().decode(bytes);
      const { title, text } = htmlToText(html);
      if (text.replace(/\s/g, "").length < 30) {
        return { ok: false, reason: "the page returned no readable text (it may be JavaScript-rendered or empty)" };
      }

      return {
        ok: true,
        url: normalizeUrl(rawUrl)!,
        finalUrl: url,
        title,
        text: text.slice(0, MAX_TEXT_CHARS),
      };
      } finally {
        await dispatcher.close().catch(() => undefined);
      }
    }
    return { ok: false, reason: "too many redirects" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = err instanceof Error && err.name === "AbortError";
    return { ok: false, reason: isAbort ? "the request timed out" : `the fetch failed (${msg})` };
  } finally {
    clearTimeout(timer);
  }
}
