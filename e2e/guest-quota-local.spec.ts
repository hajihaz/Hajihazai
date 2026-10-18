import { expect, test } from "@playwright/test";
import { db } from "@/lib/db";
import { conversations, messages, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { reserveGuestMessage } from "@/lib/db/queries";

test.describe("durable guest message quota", () => {
  test.skip(process.env.LOCAL_E2E_DB !== "1", "Requires disposable local DB");

  test("two simultaneous fifth turns admit exactly one and deletion never resets quota", async () => {
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, email: `guest-${id}@guest.hajihaz.ai`, name: "Guest" });
    const [conversation] = await db.insert(conversations).values({ userId: id }).returning({ id: conversations.id });
    await db.insert(messages).values(Array.from({ length: 4 }, (_, index) => ({ conversationId: conversation.id, role: "user" as const, content: `prior-${index}` })));

    const outcomes = await Promise.all(Array.from({ length: 6 }, () => reserveGuestMessage(id, 5)));
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const [meter] = await db.select({ used: users.guestMessagesUsed }).from(users).where(eq(users.id, id));
    expect(meter.used).toBe(5);
    await db.delete(messages).where(eq(messages.conversationId, conversation.id));
    expect(await reserveGuestMessage(id, 5)).toBe(false);
  });

  test("an existing guest with five historical turns cannot reserve a sixth", async () => {
    const id = crypto.randomUUID();
    await db.insert(users).values({ id, email: `guest-${id}@guest.hajihaz.ai`, name: "Guest" });
    const [conversation] = await db.insert(conversations).values({ userId: id }).returning({ id: conversations.id });
    await db.insert(messages).values(Array.from({ length: 5 }, (_, index) => ({ conversationId: conversation.id, role: "user" as const, content: `prior-${index}` })));
    expect(await reserveGuestMessage(id, 5)).toBe(false);
  });
});
