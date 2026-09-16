import { auth } from "@/auth";
import { db, knowledgeAuditLog, users } from "@/lib/db";
import { eq, or } from "drizzle-orm";

export async function DELETE() {
  const session = await auth();
  const userId = session?.user?.id;
  const email = session?.user?.email?.trim().toLowerCase();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  await db.delete(knowledgeAuditLog).where(
    email
      ? or(eq(knowledgeAuditLog.userId, userId), eq(knowledgeAuditLog.email, email))
      : eq(knowledgeAuditLog.userId, userId),
  );

  const deleted = await db
    .delete(users)
    .where(eq(users.id, userId))
    .returning({ id: users.id });

  if (!deleted.length) return new Response("Account not found", { status: 404 });
  return Response.json({ deleted: true });
}
