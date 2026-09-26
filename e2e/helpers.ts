import { expect, type APIRequestContext } from "@playwright/test";

/**
 * Local isolated E2E contexts are pre-authenticated by global-setup. When a
 * spec is run against an environment without storage state, fall back to the
 * explicit credential login so the same spec remains independently runnable.
 */
export async function ensureE2EAuthenticated(request: APIRequestContext) {
  const probe = await request.get("/api/conversations");
  if (probe.status() === 200) return;

  const identifier = process.env.E2E_IDENTIFIER;
  const password = process.env.E2E_PASSWORD;
  expect(identifier, "E2E_IDENTIFIER is required").toBeTruthy();
  expect(password, "E2E_PASSWORD is required").toBeTruthy();
  const login = await request.post("/api/auth/login", {
    data: { identifier, password },
  });
  expect(login.status()).toBe(200);
}
