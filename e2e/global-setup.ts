import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { request, type FullConfig } from "@playwright/test";

export const E2E_AUTH_STATE = "test-results/.auth/e2e-user.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (typeof baseURL !== "string" || !/^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/i.test(baseURL)) return;

  const identifier = process.env.E2E_IDENTIFIER;
  const password = process.env.E2E_PASSWORD;
  if (!identifier || !password) throw new Error("E2E_IDENTIFIER and E2E_PASSWORD are required for isolated E2E");

  await mkdir(dirname(E2E_AUTH_STATE), { recursive: true });
  const context = await request.newContext({ baseURL });
  try {
    const login = await context.post("/api/auth/login", { data: { identifier, password } });
    if (login.status() !== 200) {
      throw new Error(`Isolated E2E bootstrap login failed with HTTP ${login.status()}: ${await login.text()}`);
    }
    await context.storageState({ path: E2E_AUTH_STATE });
  } finally {
    await context.dispose();
  }
}
