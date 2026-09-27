import { test, expect } from "@playwright/test";
import { ensureE2EAuthenticated } from "./helpers";

const E2E_IDENTIFIER = process.env.E2E_IDENTIFIER;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

test.describe("memory v6 lifecycle", () => {
  test.skip(!E2E_IDENTIFIER || !E2E_PASSWORD, "E2E credentials are required for memory lifecycle coverage.");

  test("edits metadata, replaces a fact, and exposes lifecycle history", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);

    const created = await page.request.post("/api/memories", {
      data: {
        title: "E2E Memory V6",
        type: "fact",
        content: "E2E memory-v6-old-value",
        importance: 4,
        confidence: 88,
      },
    });
    expect(created.status()).toBe(201);
    const original = (await created.json()).memory as { id: string };
    let replacementId: string | null = null;

    try {
      const updated = await page.request.patch(`/api/memories/${original.id}`, {
        data: { importance: 5, confidence: 95, title: "E2E Memory V6 Updated" },
      });
      expect(updated.status()).toBe(200);
      const updatedBody = (await updated.json()).memory;
      expect(updatedBody.importance).toBe(5);
      expect(updatedBody.confidence).toBe(95);
      expect(updatedBody.title).toBe("E2E Memory V6 Updated");

      const replaced = await page.request.post(`/api/memories/${original.id}/replace`, {
        data: {
          title: "E2E Memory V6 Replacement",
          content: "E2E memory-v6-new-value",
          type: "fact",
          importance: 5,
          confidence: 97,
        },
      });
      expect(replaced.status()).toBe(201);
      const replacement = (await replaced.json()).replacement as { id: string; content: string };
      replacementId = replacement.id;
      expect(replacement.content).toContain("memory-v6-new-value");

      const list = await page.request.get("/api/memories?status=all");
      expect(list.status()).toBe(200);
      const body = await list.json();
      const old = body.memories.find((memory: { id: string }) => memory.id === original.id);
      const current = body.memories.find((memory: { id: string }) => memory.id === replacement.id);
      expect(old.supersededBy).toBe(replacement.id);
      expect(old.validUntil).toBeTruthy();
      expect(current.status).toBe("active");
      expect(body.stats.superseded).toBeGreaterThanOrEqual(1);
      expect(body.stats.retrievable).toBeGreaterThanOrEqual(1);

      await page.goto("/memory/manage", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Manage Memory" })).toBeVisible();
      await page.getByRole("button", { name: "replaced", exact: true }).click();
      await page.getByPlaceholder("Search memory history…").fill("E2E Memory V6 Updated");
      await expect(page.getByText("E2E Memory V6 Updated", { exact: true })).toBeVisible();
      await expect(page.getByText("replaced", { exact: true }).first()).toBeVisible();

      await page.getByRole("button", { name: "current", exact: true }).click();
      await page.getByPlaceholder("Search memory history…").fill("E2E Memory V6 Replacement");
      await expect(page.getByText("E2E Memory V6 Replacement", { exact: true })).toBeVisible();
      await expect(page.getByText("Priority 5/5", { exact: true })).toBeVisible();
      await expect(page.getByText("Confidence 97%", { exact: true })).toBeVisible();
    } finally {
      if (replacementId) await page.request.delete(`/api/memories/${replacementId}`).catch(() => {});
      await page.request.delete(`/api/memories/${original.id}`).catch(() => {});
    }
  });
});
