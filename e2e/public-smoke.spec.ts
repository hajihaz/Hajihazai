import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test.describe("public production smoke", () => {
  test("sign-in page renders", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Think deeper\. Build faster\./i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue as guest/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create an account/i })).toBeVisible();
  });

  test("Google OAuth initiation reaches Google", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Continue with Google/i }).click();
    await expect.poll(() => new URL(page.url()).host, {
      timeout: 15_000,
      message: "Google OAuth should redirect away from the app to accounts.google.com",
    }).toBe("accounts.google.com");
    expect(page.url()).not.toMatch(/\/api\/auth\/error/i);
    if (process.env.LOCAL_E2E_DB !== "1") {
      await expect(page).toHaveTitle(/Sign in - Google Accounts/i);
    }
  });

  test("protected APIs reject anonymous access", async ({ request }) => {
    for (const path of ["/api/models", "/api/brains", "/api/conversations"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
    }
  });
});
