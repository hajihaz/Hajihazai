import { test, expect } from "@playwright/test";

const E2E_IDENTIFIER = process.env.E2E_IDENTIFIER;
const E2E_PASSWORD = process.env.E2E_PASSWORD;
const HAS_CREDENTIALS = Boolean(E2E_IDENTIFIER && E2E_PASSWORD);
const ALLOW_WRITE = process.env.E2E_ALLOW_WRITE === "true";

function parseSse(text: string) {
  return text.split("\n\n").flatMap((block) => {
    const line = block.split("\n").find((v) => v.startsWith("data: "));
    if (!line) return [];
    try { return [JSON.parse(line.slice(6))]; } catch { return []; }
  });
}

test.describe("authenticated production smoke", () => {
  test.skip(!HAS_CREDENTIALS, "Set E2E_IDENTIFIER and E2E_PASSWORD to run authenticated smoke.");

  test("credentials login establishes a session and loads the workspace", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { identifier: E2E_IDENTIFIER, password: E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);
    expect((await login.json()).ok).toBe(true);
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible();
    await expect(page.getByText("New Chat", { exact: true }).first()).toBeVisible();
  });

  test("authenticated read APIs remain available and scoped", async ({ page }) => {
    const login = await page.request.post("/api/auth/login", {
      data: { identifier: E2E_IDENTIFIER, password: E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);
    for (const path of ["/api/conversations", "/api/models", "/api/brains", "/api/projects"]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(200);
    }
  });

  test("isolated authenticated chat journey persists across reload", async ({ page }) => {
    test.skip(!ALLOW_WRITE, "Set E2E_ALLOW_WRITE=true only for an isolated write-capable test environment.");
    test.setTimeout(120_000);
    const login = await page.request.post("/api/auth/login", {
      data: { identifier: E2E_IDENTIFIER, password: E2E_PASSWORD },
    });
    expect(login.status()).toBe(200);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible();

    const create = await page.request.post("/api/conversations", { data: {} });
    expect(create.status()).toBe(200);
    const conversation = await create.json();
    expect(conversation.id).toBeTruthy();

    await page.goto(`/?c=${conversation.id}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible();

    const chat = await page.request.post("/api/chat", {
      data: {
        conversationId: conversation.id,
        message: "Respond with the exact token E2E_OK and nothing else.",
        level: "low",
        brainMode: "smart",
      },
      timeout: 90_000,
    });
    expect(chat.status()).toBe(200);
    const events = parseSse(await chat.text());
    const chunks = events.filter((e) => e.t === "chunk").map((e) => e.text ?? "").join("");
    const done = events.find((e) => e.t === "done");
    expect(chunks).toContain("E2E_OK");
    expect(done?.conversationId).toBe(conversation.id);
    expect(done?.assistantMessageId).toBeTruthy();
    expect(done?.userMessageId).toBeTruthy();
    expect(done?.latency?.requestToRoutingMs).toEqual(expect.any(Number));
    expect(done?.latency?.requestToFirstTokenMs).toEqual(expect.any(Number));
    expect(done?.latency?.requestToFinalTokenMs).toEqual(expect.any(Number));
    expect(done?.latency?.persistenceMs).toEqual(expect.any(Number));
    expect(done?.latency?.totalMs).toEqual(expect.any(Number));

    const messages = await page.request.get(`/api/conversations/${conversation.id}/messages`);
    expect(messages.status()).toBe(200);
    const saved = await messages.json();
    expect(saved.messages.some((m: { role: string; content: string }) => m.role === "user" && m.content.includes("E2E_OK"))).toBe(true);
    expect(saved.messages.some((m: { role: string; content: string }) => m.role === "assistant" && m.content.includes("E2E_OK"))).toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("E2E_OK", { exact: false }).last()).toBeVisible({ timeout: 30_000 });
  });
});
