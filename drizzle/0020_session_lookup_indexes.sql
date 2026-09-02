CREATE INDEX "admin_sessions_expires_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "password_reset_used_idx" ON "password_reset_tokens" USING btree ("used_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "session_expires_idx" ON "session" USING btree ("expires");