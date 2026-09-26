import { test, expect } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";

const E2E_IDENTIFIER = process.env.E2E_IDENTIFIER;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

test.describe("project chat synchronization", () => {
  test.skip(!E2E_IDENTIFIER || !E2E_PASSWORD, "E2E credentials are required for authenticated project UX coverage.");

  test("covers project CRUD, project chat creation, navigation, reload, and search", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible({ timeout: 30_000 });

    const create = await page.request.post("/api/projects", {
      data: { name: "E2E Lifecycle Project", description: "CRUD and chat lifecycle" },
    });
    expect(create.status()).toBe(201);
    const project = (await create.json()).project as { id: string; name: string };

    let artifactId: string | null = null;
    let automationId: string | null = null;
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

      const artifact = await page.request.post("/api/artifacts", {
        data: {
          conversationId: chatBody.id,
          title: "E2E Project Search Artifact",
          content: "project-v5-needle searchable artifact content",
        },
      });
      expect(artifact.status()).toBe(201);
      artifactId = (await artifact.json()).artifact.id as string;

      const automation = await page.request.post("/api/automations", {
        data: {
          name: "E2E Project Search Automation",
          prompt: "automation-v5-needle searchable automation prompt",
          schedule: "0 9 * * *",
          timezone: "UTC",
          projectId: project.id,
        },
      });
      expect(automation.status()).toBe(201);
      automationId = (await automation.json()).automation.id as string;

      const workspace = await page.request.get("/api/projects/" + project.id);
      expect(workspace.status()).toBe(200);
      const workspaceBody = await workspace.json();
      expect(workspaceBody.project.name).toBe("E2E Lifecycle Project Renamed");
      expect(workspaceBody.project.instructions).toBe("Use lifecycle instructions.");
      expect(workspaceBody.chats.some((c: { id: string }) => c.id === chatBody.id)).toBe(true);
      expect(workspaceBody.activity.some((event: { kind: string; title: string }) => event.kind === "artifact" && event.title === "E2E Project Search Artifact")).toBe(true);
      expect(workspaceBody.activity.some((event: { kind: string; title: string }) => event.kind === "automation" && event.title === "E2E Project Search Automation")).toBe(true);

      const search = await page.request.get("/api/projects/" + project.id + "/search?q=project-v5-needle");
      expect(search.status()).toBe(200);
      expect((await search.json()).results.some((result: { kind: string; title: string }) => result.kind === "artifact" && result.title === "E2E Project Search Artifact")).toBe(true);

      const automationSearch = await page.request.get("/api/projects/" + project.id + "/search?q=automation-v5-needle");
      expect(automationSearch.status()).toBe(200);
      expect((await automationSearch.json()).results.some((result: { kind: string; title: string }) => result.kind === "automation" && result.title === "E2E Project Search Automation")).toBe(true);

      const instructionSearch = await page.request.get("/api/projects/" + project.id + "/search?q=lifecycle%20instructions");
      expect(instructionSearch.status()).toBe(200);
      expect((await instructionSearch.json()).results.some((result: { kind: string }) => result.kind === "project")).toBe(true);

      await page.goto("/projects/" + project.id, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("E2E Lifecycle Project Renamed", { exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("button", { name: "New chat" })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Recent activity", { exact: true })).toBeVisible();
      await expect(page.getByText("E2E Project Search Artifact", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Project sections" })).toBeVisible();

      const projectSearch = page.getByRole("textbox", { name: "Search this project" });
      await projectSearch.fill("project-v5-needle");
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await expect(page.locator("#search").getByText("E2E Project Search Artifact", { exact: true })).toBeVisible();

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByText("E2E Lifecycle Project Renamed", { exact: true })).toBeVisible({ timeout: 15_000 });

      const conversations = await page.request.get("/api/conversations");
      expect(conversations.status()).toBe(200);
      expect((await conversations.json()).conversations.some((c: { id: string; projectId: string | null }) => c.id === chatBody.id && c.projectId === project.id)).toBe(true);
    } finally {
      if (automationId) await page.request.delete("/api/automations/" + automationId).catch(() => {});
      if (artifactId) await page.request.delete("/api/artifacts/" + artifactId).catch(() => {});
      await page.request.delete("/api/projects/" + project.id).catch(() => {});
    }
  });

  test("refreshes project context after a project is renamed elsewhere", async ({ page, context }) => {
    await ensureE2EAuthenticated(page.request);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible({ timeout: 30_000 });

    const create = await page.request.post("/api/projects", {
      data: { name: "E2E Sync Project", description: "Project sync test" },
    });
    expect(create.status()).toBe(201);
    const project = (await create.json()).project as { id: string; name: string };
    const otherTab = await context.newPage();

    try {
      await ensureE2EAuthenticated(otherTab.request);

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
