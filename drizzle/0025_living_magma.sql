CREATE TYPE "public"."automation_status" AS ENUM('active', 'paused', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "automation_run" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text DEFAULT 'running' NOT NULL,
	"output" text,
	"error" text,
	"model_id" text
);
--> statement-breakpoint
CREATE TABLE "automation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" text,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"schedule" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" "automation_status" DEFAULT 'active' NOT NULL,
	"next_run_at" timestamp,
	"last_run_at" timestamp,
	"last_status" text,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_memory" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"memory_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_automation_id_automation_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_run" ADD CONSTRAINT "automation_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation" ADD CONSTRAINT "automation_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory" ADD CONSTRAINT "project_memory_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory" ADD CONSTRAINT "project_memory_memory_id_user_memory_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."user_memory"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memory" ADD CONSTRAINT "project_memory_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_run_automation_idx" ON "automation_run" USING btree ("automation_id","started_at");--> statement-breakpoint
CREATE INDEX "automation_run_user_idx" ON "automation_run" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "automation_user_idx" ON "automation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "automation_project_idx" ON "automation" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "automation_due_idx" ON "automation" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_memory_unique_idx" ON "project_memory" USING btree ("project_id","memory_id");--> statement-breakpoint
CREATE INDEX "project_memory_project_idx" ON "project_memory" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_memory_memory_idx" ON "project_memory" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "project_memory_user_idx" ON "project_memory" USING btree ("user_id");