import { expect, test } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";
import { db } from "@/lib/db";
import { admins, messages } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";

test.describe("HajiHaz conversation-first workspace", () => {
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Runs only against a disposable local DB");

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
    await page.getByRole("button", { name: "Expand sidebar" }).click();
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

  test("mobile: tools remain usable without horizontal overflow", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-app-ready="true"]')).toBeVisible();
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open conversations" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Admin Portal" })).toBeVisible();
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
