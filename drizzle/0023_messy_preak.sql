CREATE TABLE "artifact_version" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"conversation_id" text,
	"title" text DEFAULT 'Untitled artifact' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_attachment" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"document_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "intelligence_level" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "original_name" text;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "byte_size" integer;--> statement-breakpoint
ALTER TABLE "knowledge_document" ADD COLUMN "file_data" text;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachment" ADD CONSTRAINT "conversation_attachment_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachment" ADD CONSTRAINT "conversation_attachment_document_id_knowledge_document_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachment" ADD CONSTRAINT "conversation_attachment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_version_artifact_idx" ON "artifact_version" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE INDEX "artifact_user_idx" ON "artifact" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "artifact_conversation_idx" ON "artifact" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_attachment_unique_idx" ON "conversation_attachment" USING btree ("conversation_id","document_id");--> statement-breakpoint
CREATE INDEX "conversation_attachment_conversation_idx" ON "conversation_attachment" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_attachment_user_idx" ON "conversation_attachment" USING btree ("user_id");