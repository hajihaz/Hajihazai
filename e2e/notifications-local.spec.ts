import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { ensureE2EAuthenticated } from "./helpers";

const E2E_IDENTIFIER = process.env.E2E_IDENTIFIER;
const E2E_PASSWORD = process.env.E2E_PASSWORD;

test.describe("notification center", () => {
  test.skip(!E2E_IDENTIFIER || !E2E_PASSWORD, "E2E credentials are required for notification UI coverage.");

  test("shows an unread notification and marks it read", async ({ page }) => {
    await ensureE2EAuthenticated(page.request);

    const identifier = E2E_IDENTIFIER!;
    const { db, schema } = await (async () => {
      const dbModule = await import("@/lib/db");
      const schemaModule = await import("@/lib/db/schema");
      return { db: dbModule.db, schema: schemaModule };
    })();
    const [profile] = await db.select({ userId: schema.userProfiles.userId }).from(schema.userProfiles).where(eq(schema.userProfiles.username, identifier));
    expect(profile?.userId).toBeTruthy();

    const [notification] = await db.insert(schema.notifications).values({
      title: "E2E notification",
      message: "This notification should appear in the center.",
      targetType: "specific",
    }).returning();
    await db.insert(schema.notificationTargets).values({ notificationId: notification.id, userId: profile.userId });
    await db.update(schema.notifications).set({ sentAt: new Date() }).where(eq(schema.notifications.id, notification.id));
    await db.insert(schema.userNotifications).values({ userId: profile.userId, notificationId: notification.id });

    try {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.getByPlaceholder("Message HajiHaz AI…")).toBeVisible({ timeout: 30_000 });

      const bell = page.getByRole("button", { name: /Notifications, 1 unread/ });
      await expect(bell).toBeVisible();
      await bell.click();
      await expect(page.getByText("E2E notification", { exact: true })).toBeVisible();
      await expect(page.getByText("This notification should appear in the center.", { exact: true })).toBeVisible();

      await page.getByRole("button", { name: /E2E notification/ }).click();
      await expect(page.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /Notifications, 1 unread/ })).toHaveCount(0);
    } finally {
      await db.delete(schema.notifications).where(eq(schema.notifications.id, notification.id));
    }
  });
});
