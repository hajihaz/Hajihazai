DROP INDEX "knowledge_content_document_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_content_document_unique_idx" ON "knowledge_content" USING btree ("documentId");