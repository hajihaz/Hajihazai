/** Return a stable client address for coarse abuse/rate limiting.
 *
 * On Vercel/proxied deployments, x-forwarded-for is populated by the trusted
 * ingress. We use only the first address and cap its length before using it in
 * a rate-limit key. This is not an authorization signal.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",", 1)[0]?.trim();
  if (first && first.length <= 128) return first;

  const real = req.headers.get("x-real-ip")?.trim();
  if (real && real.length <= 128) return real;

  return "unknown";
}

/** Build a bounded key from client address + optional identity value. */
export function rateLimitIdentity(req: Request, scope: string, identity?: string): string {
  const ip = getClientIp(req);
  const normalized = identity?.trim().toLowerCase().slice(0, 256) ?? "";
  return normalized ? `${scope}:ip:${ip}:id:${normalized}` : `${scope}:ip:${ip}`;
}


/** Reject oversized request bodies before JSON parsing to avoid unnecessary memory work.
 * Content-Length is the only size signal available before consuming the body.
 */
export function rejectOversizedBody(req: Request, maxBytes: number): Response | null {
  const raw = req.headers.get("content-length");
  if (!raw) return null;
  const length = Number(raw);
  if (!Number.isFinite(length) || length < 0) {
    return new Response("Invalid Content-Length", { status: 400 });
  }
  if (length > maxBytes) return new Response("Request body is too large", { status: 413 });
  return null;
}
