import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Local isolated E2E runs may provide credentials and a test base URL in .env.test.
// dotenv does not overwrite CI/shell-provided values.
if (process.env.E2E_BASE_URL === "http://127.0.0.1:3000") {
  loadEnv({ path: ".env.test", override: false });
}

const baseURL = process.env.E2E_BASE_URL ?? "https://hajihazai.vercel.app";
const writeCapable = process.env.E2E_ALLOW_WRITE === "true";
const localE2E = /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?$/i.test(baseURL);

// Write-capable E2E must be physically isolated. This guard intentionally fails
// before Playwright starts if someone accidentally points it at production.
if (writeCapable && (!localE2E || process.env.LOCAL_E2E_DB !== "1")) {
  throw new Error(
    "Refusing write-capable E2E: E2E_ALLOW_WRITE=true requires a localhost base URL and LOCAL_E2E_DB=1.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
