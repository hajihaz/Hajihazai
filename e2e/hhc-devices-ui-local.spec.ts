import { expect, test } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";
test.describe("customer HHC device dashboard", () => {
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Isolated local database only");
  test("reuses an authorized online customer Mac after page reload without pairing UI", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    const started = await page.request.post("/api/hhc/devices");
    expect(started.status()).toBe(201);
    const pairing = await started.json();
    const completed = await page.request.post("/api/hhc/agent/pair", {
      data: { pairingCode: pairing.pairingCode, name: "My Personal Mac" },
    });
    expect(completed.status()).toBe(201);
    const enrolled = await completed.json();
    const id = enrolled.device.id as string;
    const secret = enrolled.deviceToken as string;
    try {
      const online = await page.request.get("/api/hhc/agent/" + id, {
        headers: { authorization: "Bearer " + secret },
      });
      expect(online.status()).toBe(200);
      await page.goto("/devices");
      await expect(page.getByText("Your Mac is connected")).toBeVisible();
      await expect(page.getByText("My Personal Mac")).toBeVisible();
      await expect(page.getByRole("link", { name:"Chat with HajiHaz AI" })).toBeVisible();
      await expect(page.getByRole("button",{name:"Set up HHC on my Mac"})).toHaveCount(0);
      await page.reload();
      await expect(page.getByText("Your Mac is connected")).toBeVisible();
      await expect(page.getByRole("button",{name:"Set up HHC on my Mac"})).toHaveCount(0);
    } finally {
      const revoked = await page.request.delete("/api/hhc/devices/" + id);
      expect(revoked.status()).toBe(200);
    }
  });

  test("creates a one-time pairing token without any shared owner tunnel", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    await page.goto("/devices");
    await expect(page.getByRole("heading", { name: "My Computer" })).toBeVisible();
    await expect(page.getByText("No computer connected", { exact:false })).toBeVisible();
    await page.getByRole("button", { name:"Set up HHC on my Mac" }).click();
    await page.getByRole("button", { name:"Create one-time connection key" }).click();
    await expect(page.getByText("Use this key in HHC", { exact:false })).toBeVisible();
    const code = (await page.locator("code").first().textContent())?.trim() ?? "";
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(page.getByText("No computer connected", { exact:false })).toBeVisible();
    expect(await page.locator("body").evaluate(el => el.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});