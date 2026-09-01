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
