import { test, expect } from "@playwright/test";

const E2E_IDENTIFIER = process.env.E2E_IDENTIFIER;
const E2E_PASSWORD = process.env.E2E_PASSWORD;
const HAS_CREDENTIALS = Boolean(E2E_IDENTIFIER && E2E_PASSWORD);

test.describe("authenticated production smoke", () => {
  test.skip(!HAS_CREDENTIALS, "Set E2E_IDENTIFIER and E2E_PASSWORD to run authenticated smoke.");

  test("credentials login establishes a session and loads the workspace", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { identifier: E2E_IDENTIFIER, password: E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);
    expect((await login.json()).ok).toBe(true);

    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible();
    await expect(page.getByText("New Chat", { exact: true }).first()).toBeVisible();
  });

  test("authenticated read APIs remain available and scoped", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { identifier: E2E_IDENTIFIER, password: E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);

    for (const path of ["/api/conversations", "/api/models", "/api/brains", "/api/projects"]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(200);
    }
  });
});
