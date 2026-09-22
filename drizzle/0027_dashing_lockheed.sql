DELETE FROM "user_notifications" a
USING "user_notifications" b
WHERE a."id" > b."id"
  AND a."user_id" = b."user_id"
  AND a."notification_id" = b."notification_id";
--> statement-breakpoint
CREATE TABLE "notification_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"notification_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_targets" ADD CONSTRAINT "notification_targets_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_targets" ADD CONSTRAINT "notification_targets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_targets_unique_idx" ON "notification_targets" USING btree ("notification_id","user_id");--> statement-breakpoint
CREATE INDEX "notification_targets_notification_idx" ON "notification_targets" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notification_targets_user_idx" ON "notification_targets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_notifications_unique_idx" ON "user_notifications" USING btree ("user_id","notification_id");