import { test, expect } from "@playwright/test";

test.describe("public production smoke", () => {
  test("sign-in page renders", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Welcome to HajiHaz AI/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Continue with Google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Create an account/i })).toBeVisible();
  });

  test("protected APIs reject anonymous access", async ({ request }) => {
    for (const path of ["/api/models", "/api/brains", "/api/conversations"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(401);
    }
  });
});
