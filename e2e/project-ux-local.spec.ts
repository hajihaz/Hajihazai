import { test, expect } from "@playwright/test";

const E2E_IDENTIFIER = process.env.E2E_IDENTIFIER;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

test.describe("project chat synchronization", () => {
  test.skip(!E2E_IDENTIFIER || !E2E_PASSWORD, "E2E credentials are required for authenticated project UX coverage.");

  test("refreshes project context after a project is renamed elsewhere", async ({ page, context }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { identifier: E2E_IDENTIFIER, password: E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible({ timeout: 30_000 });

    const create = await page.request.post("/api/projects", {
      data: { name: "E2E Sync Project", description: "Project sync test" },
    });
    expect(create.status()).toBe(201);
    const project = (await create.json()).project as { id: string; name: string };
    const otherTab = await context.newPage();

    try {
      const otherLogin = await otherTab.request.post("/api/auth/login", {
        data: { identifier: E2E_IDENTIFIER, password: E2E_PASSWORD },
      });
      expect(otherLogin.status()).toBe(200);

      const rename = await otherTab.request.patch("/api/projects/" + project.id, {
        data: { name: "E2E Sync Project Renamed" },
      });
      expect(rename.status()).toBe(200);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('select[aria-label="Switch project"]')).toContainText(
        "E2E Sync Project Renamed",
        { timeout: 15_000 },
      );
    } finally {
      await otherTab.close().catch(() => {});
      await page.request.delete("/api/projects/" + project.id).catch(() => {});
    }
  });
});
