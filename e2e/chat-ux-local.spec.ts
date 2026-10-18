import { expect, test } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";
import { db } from "@/lib/db";
import { admins, messages } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";

test.describe("HajiHaz conversation-first workspace", () => {
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Runs only against a disposable local DB");

  test("hides sidebar brains and composer Smart mode without disabling automatic routing", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    const brainRequests: string[] = [];
    page.on("request", (request) => { if (request.url().includes("/api/brains")) brainRequests.push(request.url()); });
    let chatPayload: { brainId: string | null; brainMode: string; message: string } | null = null;
    await page.route("**/api/chat", async (route) => {
      chatPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: 'data: {"t":"chunk","text":"Automatic routing works"}\n\ndata: {"t":"done"}\n\n',
      });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "Brains", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /brain AllBee Brain/ })).toHaveCount(0);
    await expect(page.getByText("Haji Core", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Smart" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add attachments or tools" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Voice input" })).toBeVisible();
    await page.getByPlaceholder("Message HajiHaz AI…").fill("Hello from automatic routing");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Automatic routing works", { exact: true })).toBeVisible();
    expect(chatPayload).toMatchObject({ brainId: null, brainMode: "smart", message: "Hello from automatic routing" });
    expect(brainRequests).toHaveLength(0);
  });

  test("desktop: fast composer, tools, and reversible sidebar", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where should we begin?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New chat", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    await expect(page.locator("aside").getByRole("button", { name: "New Chat", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.locator("aside").getByRole("button", { name: "New Chat", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "More chat tools" }).click();
    await expect(page.getByRole("menu", { name: "Chat tools" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "File library" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add attachments or tools" }).click();
    await expect(page.getByRole("menuitem", { name: "Create image" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByPlaceholder("Message HajiHaz AI…").fill("This is a composer test");
    await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  test("keeps all existing export formats in the compact chat menu", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    const conversation = await page.request.post("/api/conversations", { data: {} });
    expect(conversation.status()).toBe(200);
    const { id } = await conversation.json();
    await db.insert(messages).values({ conversationId: id, role: "user", content: "export format check" });
    await page.goto(`/?c=${id}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await expect(page.getByText("export format check", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "More chat tools" }).click();
    await page.locator("summary").filter({ hasText: "Export conversation" }).click();
    await expect(page.getByRole("menuitem", { name: "Markdown (.md)" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Text (.txt)" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Print / PDF" })).toBeVisible();
  });

  test("uploaded documents trigger the chat reply exactly once", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    let uploadCount = 0;
    const prompts: string[] = [];
    await page.route("**/api/knowledge/upload", async (route) => {
      uploadCount += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, documentId: "ui-test-doc", chunks: 1 }) });
    });
    await page.route("**/api/chat", async (route) => {
      const body = route.request().postDataJSON();
      prompts.push(body.message);
      const events = [
        { t: "chunk", text: "Document reply verified" },
        { t: "done", userMessageId: "test-user", assistantMessageId: "test-assistant" },
      ];
      await route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await page.locator('input[type="file"][accept*=".docx"]').setInputFiles({
      name: "attached-notes.txt", mimeType: "text/plain", buffer: Buffer.from("Test an attached document."),
    });
    await page.getByPlaceholder("Message HajiHaz AI…").fill("Summarize this note");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Document reply verified", { exact: true })).toBeVisible({ timeout: 12000 });
    expect(uploadCount).toBe(1);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("attached-notes.txt");
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toHaveValue("");
  });

  test("voice dictation updates the actual chat composer", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    await page.addInitScript(() => {
      class TestSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = "en-US";
        onresult: ((event: { resultIndex: number; results: Array<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        start() {
          this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: "voice dictation works" }, isFinal: true }] });
          this.onend?.();
        }
        stop() { this.onend?.(); }
        abort() {}
      }
      Object.assign(window, { SpeechRecognition: TestSpeechRecognition });
    });
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.headers()["permissions-policy"]).toContain("microphone=(self)");
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Voice input" }).click();
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toHaveValue("voice dictation works");
    await expect(page.getByRole("button", { name: "Send message" })).toBeEnabled();
  });

  test("mobile: tools remain usable without horizontal overflow", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open conversations" })).toBeVisible();
    await expect(page.locator("aside").getByRole("button", { name: "New Chat", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Open conversations" }).click();
    await expect(page.locator("aside").getByRole("button", { name: "New Chat", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close conversations" }).click();
    await expect(page.getByRole("button", { name: "Add attachments or tools" })).toBeVisible();
    await page.getByRole("button", { name: "Add attachments or tools" }).click();
    await expect(page.getByRole("menuitem", { name: "Upload files" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("Admin entry design", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("admin sign-in is readable on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    // First visit to /admin may compile and load a cold admin-session check.
    await expect(page.getByRole("heading", { name: "Admin Portal" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByPlaceholder("Admin Username")).toBeVisible();
    await expect(page.getByRole("button", { name: "Show password" })).toBeVisible();
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(page.getByRole("button", { name: "Hide password" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});


test.describe("Admin control center navigation", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Admin UI writes must use disposable local database");

  test("desktop groups working admin sections without a crowded tab strip", async ({ page }) => {
    const username = `adminux${crypto.randomUUID().slice(0, 8)}`;
    const password = "TestAdminOnly!2026";
    await db.insert(admins).values({ username, passwordHash: await hashPassword(password) });
    const login = await page.request.post("/api/admin/login", { data: { username, password } });
    expect(login.status()).toBe(200);
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Administration" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("button", { name: "Admin accounts" })).toBeVisible();
    await page.getByRole("navigation").getByRole("button", { name: "Admin accounts" }).click();
    await expect(page.getByRole("heading", { name: "Admin accounts" }).first()).toBeVisible();
    await page.getByRole("navigation").getByRole("button", { name: "Users", exact: true }).click();
    await expect(page.getByPlaceholder("Search by email, name, or username…")).toBeVisible();
    await page.getByRole("navigation").getByRole("button", { name: "Dashboard" }).click();
    await expect(page.getByRole("button", { name: "Show detailed metrics" })).toBeVisible();
    await page.getByRole("button", { name: "Show detailed metrics" }).click();
    await expect(page.getByRole("button", { name: "Hide detailed metrics" })).toBeVisible();
  });

  test("mobile admin navigation stays within the viewport", async ({ page }) => {
    const username = `adminux${crypto.randomUUID().slice(0, 8)}`;
    const password = "TestAdminOnly!2026";
    await db.insert(admins).values({ username, passwordHash: await hashPassword(password) });
    const login = await page.request.post("/api/admin/login", { data: { username, password } });
    expect(login.status()).toBe(200);
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    const section = page.getByRole("combobox", { name: "Admin section" });
    await expect(section).toBeVisible();
    await section.selectOption("knowledge");
    await expect(page.getByRole("heading", { name: "Knowledge base" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
