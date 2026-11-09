/**
 * Shared cron authorization helper.
 * Route files can export only Next.js route handlers/config keys.
 */
export function isCronAuthorized(
  req: Request,
  secret = process.env.CRON_SECRET,
): boolean {
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
