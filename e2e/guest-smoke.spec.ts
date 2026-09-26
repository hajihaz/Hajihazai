import { test, expect } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

/** Guest access is intentionally the production-safe authenticated E2E identity. */
test.describe("guest production flow", () => {
  test("guest can enter the workspace and use an authenticated API", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Continue as guest/i })).toBeVisible();

    if (process.env.LOCAL_E2E_DB === "1") {
      const guest = await page.request.post("/api/auth/guest");
      expect(guest.status()).toBe(200);
      await page.goto("/", { waitUntil: "domcontentloaded" });
    } else {
      await page.getByRole("button", { name: /Continue as guest/i }).click();
    }
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "New Chat", exact: true })).toBeVisible();

    const conversations = await page.request.get("/api/conversations");
    expect(conversations.status()).toBe(200);
    const body = await conversations.json();
    expect(Array.isArray(body.conversations)).toBe(true);
  });
});
