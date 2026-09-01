CREATE TABLE "ai_model_health" (
	"model_id" text PRIMARY KEY NOT NULL,
	"healthy" boolean NOT NULL,
	"checked_at" timestamp NOT NULL,
	"latency_ms" integer,
	"error" text,
	"retry_after_ms" integer,
	"unhealthy_until" timestamp
);
--> statement-breakpoint
CREATE INDEX "ai_model_health_unhealthy_idx" ON "ai_model_health" USING btree ("unhealthy_until");