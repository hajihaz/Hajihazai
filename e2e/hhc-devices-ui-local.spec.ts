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

  test("mobile offline Mac shows non-invasive troubleshooting without asking to re-pair", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route("**/api/hhc/devices", async route => {
      if (route.request().method() === "GET") {
        return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
          enabled:true,
          devices:[{id:"6e1c30a4-18ca-41a0-8bcd-8d9a11bda13a",name:"Personal Offline Mac",
            online:false,revoked:false,lastSeenAt:null}],
        })});
      }
      return route.continue();
    });
    await page.route("**/api/hhc/commands", route=>route.fulfill({
      status:200,contentType:"application/json",body:JSON.stringify({commands:[]}),
    }));
    await page.goto("/devices");
    await expect(page.getByRole("status").filter({hasText:"Your Mac is offline"})).toBeVisible();
    const help = page.getByRole("region",{name:"Computer connection troubleshooting"});
    await expect(help.getByText("npm run customer:doctor")).toBeVisible();
    await expect(help.getByText("npm run customer:autostart:status")).toBeVisible();
    await expect(page.getByRole("button",{name:"Set up HHC on my Mac"})).toHaveCount(0);
    await expect(page.getByRole("link",{name:"Chat with HajiHaz AI"})).toHaveCount(0);
    expect(await page.locator("body").evaluate(e=>e.scrollWidth<=window.innerWidth+1)).toBe(true);
    const refresh = page.getByRole("button",{name:"Refresh connection"});
    await expect(refresh).toBeVisible();
    const bbox=await refresh.boundingBox();
    expect(bbox?.width).toBeGreaterThanOrEqual(44);
    expect(bbox?.height).toBeGreaterThanOrEqual(44);
  });

  test("private pilot disabled is distinct from offline and does not enable tools", async ({page}) => {
    await ensureE2EAuthenticated(page.request);
    await page.route("**/api/hhc/devices", route=>route.fulfill({
      status:200,contentType:"application/json",body:JSON.stringify({
        enabled:false,
        devices:[{id:"892ed4a9-fc90-46eb-8a5c-2743f3e78e60",name:"Registered Test Mac",
          online:true,revoked:false,lastSeenAt:new Date().toISOString()}],
      }),
    }));
    await page.route("**/api/hhc/commands", route=>route.fulfill({
      status:200,contentType:"application/json",body:JSON.stringify({commands:[]}),
    }));
    await page.goto("/devices");
    await expect(page.getByRole("status").filter({hasText:"Customer HHC pilot is paused"})).toBeVisible();
    await expect(page.getByText("Reinstalling or pairing will not bypass this restriction.")).toBeVisible();
    await expect(page.getByRole("link",{name:"Chat with HajiHaz AI"})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"Set up HHC on my Mac"})).toHaveCount(0);
  });

});