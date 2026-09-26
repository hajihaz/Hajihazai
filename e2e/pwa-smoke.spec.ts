import { test, expect } from "@playwright/test";

test.describe("PWA shell", () => {
  test("serves an installable manifest and service worker", async ({ request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBeTruthy();
    const manifest = await manifestResponse.json();
    expect(manifest.name).toBe("HajiHaz AI");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/branding/hajihaz-mark.png", sizes: "512x512" }),
    ]));

    const workerResponse = await request.get("/sw.js");
    expect(workerResponse.ok()).toBeTruthy();
    expect(workerResponse.headers()["service-worker-allowed"]).toBe("/");
    expect(workerResponse.headers()["cache-control"]).toContain("max-age=0");
  });

  test("offline shell is mobile-safe and has a recovery action", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/offline", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Try again" })).toHaveAttribute("href", "/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
