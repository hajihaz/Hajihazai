-- A monotonic, per-guest lifetime turn meter. Existing guest message rows
-- remain part of the first reservation's baseline for backward compatibility.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "guest_messages_used" integer NOT NULL DEFAULT 0;
