ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "valid_from" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "valid_until" timestamp;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "superseded_by" text;--> statement-breakpoint
ALTER TABLE "user_memory" ADD COLUMN IF NOT EXISTS "confidence" integer;