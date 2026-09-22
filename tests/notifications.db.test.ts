import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("notifications (db)", () => {
  let db: any, schema: any, queries: any;
  let userA = "", userB = "";
  const createdNotificationIds: string[] = [];

  beforeAll(async () => {
    ({ db } = await import("@/lib/db"));
    schema = await import("@/lib/db/schema");
    queries = await import("@/lib/admin/queries");
    const suffix = String(Date.now()) + "-" + String(Math.round(Math.random() * 1e6));
    const [a] = await db.insert(schema.users).values({ email: `notif-a-${suffix}@x.com` }).returning();
    const [b] = await db.insert(schema.users).values({ email: `notif-b-${suffix}@x.com` }).returning();
    userA = a.id; userB = b.id;
    await db.insert(schema.userProfiles).values([
      { userId: userA, email: a.email },
      { userId: userB, email: b.email },
    ]);
  });

  afterAll(async () => {
    if (db && createdNotificationIds.length) await db.delete(schema.notifications).where(inArray(schema.notifications.id, createdNotificationIds));
    if (db && userA) await db.delete(schema.users).where(eq(schema.users.id, userA));
    if (db && userB) await db.delete(schema.users).where(eq(schema.users.id, userB));
  });

  it("fans out an all-users notification and reports unread counts", async () => {
    const notif = await queries.adminCreateNotification({ title: "Hello", message: "World", targetType: "all" });
    createdNotificationIds.push(notif.id);
    const count = await queries.adminSendNotification(notif.id);
    expect(count).toBeGreaterThanOrEqual(2);
    const a = await queries.getUserNotifications(userA);
    const b = await queries.getUserNotifications(userB);
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(await queries.countUnreadNotifications(userA)).toBe(1);
  });

  it("marks one notification and then all notifications read, scoped to the owner", async () => {
    const items = await queries.getUserNotifications(userA);
    expect(items[0]?.isRead).toBe(false);
    expect(await queries.markNotificationRead(items[0].id, userB)).toBe(false);
    expect(await queries.markNotificationRead(items[0].id, userA)).toBe(true);
    expect(await queries.countUnreadNotifications(userA)).toBe(0);

    const notif = await queries.adminCreateNotification({ title: "Second", message: "Unread", targetType: "specific", targetUserIds: [userA] });
    createdNotificationIds.push(notif.id);
    await queries.adminSendNotification(notif.id);
    expect(await queries.countUnreadNotifications(userA)).toBe(1);
    expect(await queries.markAllNotificationsRead(userA)).toBe(1);
    expect(await queries.countUnreadNotifications(userA)).toBe(0);
  });

  it("supports specific recipients and does not fan out to others", async () => {
    const notif = await queries.adminCreateNotification({ title: "Private", message: "Only A", targetType: "specific", targetUserIds: [userA] });
    createdNotificationIds.push(notif.id);
    expect(await queries.adminSendNotification(notif.id)).toBe(1);
    expect((await queries.getUserNotifications(userA)).some((n: any) => n.notificationId === notif.id)).toBe(true);
    expect((await queries.getUserNotifications(userB)).some((n: any) => n.notificationId === notif.id)).toBe(false);
  });

  it("rejects empty specific targets and blocks double-send", async () => {
    await expect(queries.adminCreateNotification({ title: "Bad", message: "No recipient", targetType: "specific" })).rejects.toThrow("At least one recipient");
    const notif = await queries.adminCreateNotification({ title: "Once", message: "Send once", targetType: "specific", targetUserIds: [userA] });
    createdNotificationIds.push(notif.id);
    await queries.adminSendNotification(notif.id);
    await expect(queries.adminSendNotification(notif.id)).rejects.toThrow("already been sent");
  });
});
