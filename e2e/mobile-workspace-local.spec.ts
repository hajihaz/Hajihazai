import { test, expect } from "@playwright/test";

for (const width of [320, 390, 430]) {
  test(`authenticated workspace stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const composer = page.getByPlaceholder("Message HajiHaz AI…");
    await expect(composer).toBeVisible();
    await expect(page.getByRole("button", { name: "Attach files" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create image" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message" })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const box = await composer.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(width - 50);

    await composer.focus();
    await expect(composer).toBeFocused();
  });
}
