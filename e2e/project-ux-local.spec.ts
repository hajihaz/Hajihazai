import { test, expect } from "@playwright/test";

const E2E_IDENTIFIER = process.env.E2E_IDENTIFIER;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

test.describe("project chat synchronization", () => {
  test.skip(!E2E_IDENTIFIER || !E2E_PASSWORD, "E2E credentials are required for authenticated project UX coverage.");

  test("covers project CRUD, project chat creation, navigation, reload, and search", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { identifier: E2E_IDENTIFIER, password: E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible({ timeout: 30_000 });

    const create = await page.request.post("/api/projects", {
      data: { name: "E2E Lifecycle Project", description: "CRUD and chat lifecycle" },
    });
    expect(create.status()).toBe(201);
    const project = (await create.json()).project as { id: string; name: string };

    try {
      const listed = await page.request.get("/api/projects");
      expect(listed.status()).toBe(200);
      expect((await listed.json()).projects.some((p: { id: string }) => p.id === project.id)).toBe(true);

      const renamed = await page.request.patch("/api/projects/" + project.id, {
        data: { name: "E2E Lifecycle Project Renamed", instructions: "Use lifecycle instructions." },
      });
      expect(renamed.status()).toBe(200);

      const chat = await page.request.post("/api/conversations", {
        data: { projectId: project.id },
      });
      expect(chat.status()).toBe(200);
      const chatBody = await chat.json();
      expect(chatBody.projectId).toBe(project.id);

      const workspace = await page.request.get("/api/projects/" + project.id);
      expect(workspace.status()).toBe(200);
      const workspaceBody = await workspace.json();
      expect(workspaceBody.project.name).toBe("E2E Lifecycle Project Renamed");
      expect(workspaceBody.project.instructions).toBe("Use lifecycle instructions.");
      expect(workspaceBody.chats.some((c: { id: string }) => c.id === chatBody.id)).toBe(true);

      const search = await page.request.get("/api/projects/" + project.id + "/search?q=New%20chat");
      expect(search.status()).toBe(200);

      await page.goto("/projects/" + project.id, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("E2E Lifecycle Project Renamed", { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "New chat" })).toBeVisible({ timeout: 15_000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText("E2E Lifecycle Project Renamed", { exact: true })).toBeVisible({ timeout: 15_000 });

      const conversations = await page.request.get("/api/conversations");
      expect(conversations.status()).toBe(200);
      expect((await conversations.json()).conversations.some((c: { id: string; projectId: string | null }) => c.id === chatBody.id && c.projectId === project.id)).toBe(true);
    } finally {
      await page.request.delete("/api/projects/" + project.id).catch(() => {});
    }
  });

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
