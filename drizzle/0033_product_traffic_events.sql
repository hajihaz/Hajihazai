CREATE TABLE IF NOT EXISTS "product_traffic_event" (
  "id" text PRIMARY KEY NOT NULL,
  "visitor_id" text NOT NULL,
  "session_id" text NOT NULL,
  "user_id" text,
  "kind" text NOT NULL,
  "path" text NOT NULL,
  "target" text,
  "duration_seconds" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_traffic_kind_chk" CHECK ("kind" IN ('visit','view','tap','active_time')),
  CONSTRAINT "product_traffic_path_chk" CHECK (char_length("path") BETWEEN 1 AND 300 AND left("path",1)='/'
    AND position('?' in "path")=0 AND position('#' in "path")=0),
  CONSTRAINT "product_traffic_target_chk" CHECK ("target" IS NULL OR char_length("target")<=80),
  CONSTRAINT "product_traffic_duration_chk" CHECK ("duration_seconds" IS NULL OR "duration_seconds" BETWEEN 0 AND 180)
);
--> statement-breakpoint
ALTER TABLE "product_traffic_event" ADD CONSTRAINT "product_traffic_user_id_fk"
FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_traffic_created_idx" ON "product_traffic_event" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_traffic_visitor_created_idx" ON "product_traffic_event" USING btree ("visitor_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_traffic_user_created_idx" ON "product_traffic_event" USING btree ("user_id","created_at");
