-- Speed up recent and archived conversation lists without changing behavior.
CREATE INDEX IF NOT EXISTS "conversation_user_archived_updated_idx"
ON "conversation" ("userId", "archived", "updatedAt");
