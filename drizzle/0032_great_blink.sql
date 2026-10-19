CREATE TABLE "hhc_customer_commands" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"tool" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hhc_customer_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hhc_customer_pairings" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hhc_customer_commands" ADD CONSTRAINT "hhc_customer_commands_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hhc_customer_commands" ADD CONSTRAINT "hhc_customer_commands_device_id_hhc_customer_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."hhc_customer_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hhc_customer_devices" ADD CONSTRAINT "hhc_customer_devices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hhc_customer_pairings" ADD CONSTRAINT "hhc_customer_pairings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hhc_commands_owner_created_idx" ON "hhc_customer_commands" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "hhc_commands_agent_queue_idx" ON "hhc_customer_commands" USING btree ("device_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "hhc_devices_owner_idx" ON "hhc_customer_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hhc_pairings_owner_idx" ON "hhc_customer_pairings" USING btree ("user_id");--> statement-breakpoint
