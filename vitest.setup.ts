import { config } from "dotenv";

/**
 * Test environment bootstrap.
 *
 * DB-backed tests (tests/*.db.test.ts) INSERT and DELETE rows, so they must
 * NEVER point at the production database — a buggy teardown once wiped the
 * production `brains` table this way. To make that impossible we:
 *
 *   1. Load .env.test first (test-only config), then .env.local for the rest of
 *      the secrets. dotenv never overwrites an already-set key, so anything in
 *      .env.test — notably DATABASE_URL — wins over .env.local.
 *   2. Let an explicit TEST_DATABASE_URL override DATABASE_URL outright (CI).
 *   3. Refuse to run if the resolved DATABASE_URL is the production database,
 *      failing loudly instead of mutating prod.
 */
// Keep the default unit-test command DB-free. DB-backed suites are opt-in via
// RUN_DB_TESTS=1 so a developer's .env.local can never accidentally expose a
// production database to `npm test`. Isolated Playwright loads .env.test itself.
const runDbTests = process.env.RUN_DB_TESTS === "1";
if (runDbTests) {
  config({ path: ".env.test" });
  config({ path: ".env.local" });

  // An explicit test DB URL always wins (e.g. CI).
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
}

// Known production Neon host fragments — tests must never run against these.
// Add any other production/staging hosts here.
const PROD_DB_HOST_FRAGMENTS = ["ep-little-glade-ao9fsoew"];

const dbUrl = process.env.DATABASE_URL ?? "";
const matchedProdHost = PROD_DB_HOST_FRAGMENTS.find((h) => dbUrl.includes(h));

if (matchedProdHost) {
  throw new Error(
    [
      "",
      "✋  Refusing to run tests against the PRODUCTION database.",
      "",
      `    DATABASE_URL points at a production host ("${matchedProdHost}").`,
      "    DB-backed tests (tests/*.db.test.ts) INSERT and DELETE rows, so running",
      "    them against production can corrupt or wipe live data.",
      "",
      "    Point the suite at a dedicated test database instead:",
      "      1. Create a Neon branch (instant copy) or a local Postgres.",
      "      2. Set TEST_DATABASE_URL in your shell, or put DATABASE_URL in .env.test.",
      "      3. Run `node scripts/setup-test-db.mjs` once to create the schema.",
      "",
      "    See .env.test.example for the template.",
      "",
    ].join("\n"),
  );
}
