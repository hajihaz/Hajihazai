import { test, expect } from "@playwright/test";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";

// This spec deliberately creates a real guest session, not the global E2E user.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("guest five-message gate", () => {
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Guest limit writes are only safe in isolated local E2E.");

  test("allows five messages and then requires sign in without losing the session", async ({ page }) => {
    const guest = await page.request.post("/api/auth/guest");
    expect(guest.status()).toBe(200);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const composer = page.getByPlaceholder("Message HajiHaz AI…");
    await expect(composer).toBeVisible();

    const conversation = await page.request.post("/api/conversations", { data: {} });
    expect(conversation.status()).toBe(200);
    const { id } = await conversation.json();

    // Seed exactly five guest user turns without spending model/API calls. The
    // server gate counts persisted user turns across the whole guest workspace.
    await db.insert(messages).values(
      Array.from({ length: 5 }, (_, index) => ({
        conversationId: id,
        role: "user" as const,
        content: `guest message ${index + 1}`,
      })),
    );

    const sixth = await page.request.post("/api/chat", {
      data: { conversationId: id, message: "sixth message", level: "low", brainMode: "smart" },
    });
    expect(sixth.status()).toBe(403);
    await expect(sixth.json()).resolves.toMatchObject({ error: "guest_message_limit", limit: 5, used: 5 });

    await page.goto(`/?c=${id}`, { waitUntil: "domcontentloaded" });
    await expect(composer).toBeVisible();
    await composer.fill("sixth message from UI");
    await page.getByRole("button", { name: "Send message" }).click();

    const dialog = page.getByRole("dialog", { name: "Continue your conversation" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/used all 5 guest messages/i)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText("guest message 5", { exact: true })).toBeVisible();

    // Account creation replaces the guest session and transfers the same chat
    // to the durable user, so the conversation survives the gate.
    const suffix = crypto.randomUUID().slice(0, 8);
    const registered = await page.request.post("/api/auth/register", {
      data: { username: `guestkeep${suffix}`, email: `guestkeep-${suffix}@example.com`, password: "GuestKeep-2026!Pass" },
    });
    expect(registered.status()).toBe(200);
    const preserved = await page.request.get(`/api/conversations/${id}/messages`);
    expect(preserved.status()).toBe(200);
    const preservedBody = await preserved.json();
    expect(preservedBody.messages.filter((message: { role: string }) => message.role === "user")).toHaveLength(5);
  });
});
