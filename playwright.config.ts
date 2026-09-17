import { config as loadEnv } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// Local isolated E2E runs may provide credentials and a test base URL in .env.test.
// dotenv does not overwrite CI/shell-provided values.
if (process.env.E2E_BASE_URL === "http://127.0.0.1:3000") {
  loadEnv({ path: ".env.test", override: false });
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://hajihazai.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
