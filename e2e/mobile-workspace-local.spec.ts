import { test, expect } from "@playwright/test";

for (const width of [320, 390, 430]) {
  test(`authenticated workspace stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();

    const composer = page.getByPlaceholder("Message HajiHaz AI…");
    await expect(composer).toBeVisible();
    await expect(page.getByRole("button", { name: "Add attachments or tools" })).toBeVisible();
    await page.getByRole("button", { name: "Add attachments or tools" }).click();
    await expect(page.getByRole("menuitem", { name: "Upload files" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Create image" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = await composer.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(width - 50);

    await composer.focus();
    await expect(composer).toBeFocused();
  });
}
