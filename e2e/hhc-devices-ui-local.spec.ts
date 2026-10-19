import { expect, test } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";
test.describe("customer HHC device dashboard", () => {
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Isolated local database only");
  test("creates a one-time pairing token without any shared owner tunnel", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    await page.goto("/devices");
    await expect(page.getByRole("heading", { name: "My computers" })).toBeVisible();
    await expect(page.getByText("No Mac paired yet", { exact:false })).toBeVisible();
    await page.getByRole("button", { name:"Generate pairing code" }).click();
    await expect(page.getByText("One-time code", { exact:false })).toBeVisible();
    const code = (await page.locator("code").first().textContent())?.trim() ?? "";
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(page.getByText("No Mac paired yet", { exact:false })).toBeVisible();
    expect(await page.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});