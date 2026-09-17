
# E2E environment safety

HajiHaz AI has two intentionally separate E2E modes:

- `npm run test:e2e:production` — production-safe smoke tests only. These tests must remain read-only or use the disposable guest identity flow.
- `npm run test:e2e:isolated` — write-capable tests against the isolated local PostgreSQL database.

Write-capable Playwright runs are blocked unless **both** conditions are true:

1. `E2E_BASE_URL` resolves to `localhost` or `127.0.0.1`.
2. `LOCAL_E2E_DB=1` is set.

The Playwright configuration fails before test execution if `E2E_ALLOW_WRITE=true` is combined with a non-local target or without the local DB adapter. The Vitest setup has an independent production-database guard for DB-backed tests.

The local `.env.test` file is gitignored. Keep production database credentials out of `.env.test`.
