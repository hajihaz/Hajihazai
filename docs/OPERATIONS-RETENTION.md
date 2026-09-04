# Production database operations and retention

Reviewed: 2026-09-04

## Current Neon state

- PostgreSQL 18.6; `vector` 0.8.1 is installed.
- Current high-volume tables are still small: `message` 724 rows, `knowledge_chunk` 73, `user_memory` 30, `conversation` 111, `tool_invocation` 11.
- `rate_limit_buckets` has 18 live rows and 18 currently expired rows were observed during the read-only audit.
- `session` had 26 expired rows during the audit; expiry indexes are present.
- `password_reset_tokens` had 2 live rows and 0 expired rows during the audit.
- Autovacuum is active on message, knowledge, memory, session, and tool-invocation tables.

## Retention policy design

1. **Messages and conversations:** retain by default; these are user history and should not be deleted automatically without an explicit product/data-retention policy.
2. **Tool invocations:** retain 90 days for operational audit/debugging, then delete in bounded batches. Keep only the minimum payload needed; inputs/outputs are already capped in audit storage.
3. **Knowledge audit log:** retain at least 1 year unless legal/product policy requires longer. Archive before deletion if audit history becomes business-critical.
4. **Rate-limit buckets:** delete expired rows continuously in bounded batches. The application already performs sampled cleanup and has an expiry index.
5. **Sessions:** delete expired sessions in bounded batches. Login-time cleanup is already implemented; add scheduled cleanup if session volume grows.
6. **Password-reset tokens:** delete expired/used tokens in bounded batches. Creation-time cleanup is already implemented and `expires_at` is indexed.
7. **Embeddings/chunks:** retain while their canonical knowledge/memory record is active. Deleting derived data must remain coupled to canonical lifecycle changes.

## Monitoring thresholds

- Alert if `message` or `tool_invocation` growth materially exceeds expected product traffic.
- Alert if expired rate-limit/session rows repeatedly accumulate despite cleanup.
- Watch Neon storage, compute, connection count, query latency, and autovacuum health.
- Review table/index size monthly until production traffic establishes a baseline.

## Safe cleanup requirements

- Never run destructive cleanup against production from tests.
- Prefer indexed timestamp predicates and bounded batches.
- Never delete canonical user history solely because a table is large.
- Any scheduled deletion must be idempotent, observable, and documented before activation.
