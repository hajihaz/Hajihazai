import { test, expect } from "@playwright/test";

test.describe("mobile production polish", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, storageState: { cookies: [], origins: [] } });

  test("landing page fits a phone viewport and exposes accessible controls", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await expect(page.getByRole("button", { name: /Continue as guest/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Google/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Username or email" })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    const unnamedButtons = await page.locator("button").evaluateAll((buttons) =>
      buttons.filter((b) => !(b.getAttribute("aria-label") || b.textContent?.trim() || b.getAttribute("title"))).length,
    );
    expect(unnamedButtons).toBe(0);
  });
});
