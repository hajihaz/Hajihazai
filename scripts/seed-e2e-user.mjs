import { promisify } from "node:util";
import { randomUUID, randomBytes, scrypt } from "node:crypto";
import postgres from "postgres";

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";
const username = process.env.E2E_IDENTIFIER || "";
const password = process.env.E2E_PASSWORD || "";
const email = process.env.E2E_EMAIL || "e2e@hajihaz.local";

if (!url || !username || !password) {
  throw new Error("TEST_DATABASE_URL/DATABASE_URL, E2E_IDENTIFIER, and E2E_PASSWORD are required");
}
const parsed = new URL(url);
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
  throw new Error(`Refusing to seed E2E credentials on non-local database host: ${parsed.hostname}`);
}

const scryptAsync = promisify(scrypt);
const salt = randomBytes(16).toString("hex");
const derived = await scryptAsync(password, salt, 64);
const passwordHash = `scrypt:${salt}:${Buffer.from(derived).toString("hex")}`;
const sql = postgres(url, { max: 1 });

try {
  const existing = await sql`
    select distinct user_id
    from user_profiles
    where lower(username) = lower(${username}) or lower(email) = lower(${email})
  `;
  for (const row of existing) {
    await sql`delete from "user" where id = ${row.user_id}`;
  }

  const userId = randomUUID();
  await sql`insert into "user" (id, name, email) values (${userId}, ${username}, ${email})`;
  await sql`
    insert into user_profiles
      (id, user_id, email, username, password_hash, created_at, updated_at, last_login)
    values
      (${randomUUID()}, ${userId}, ${email}, ${username}, ${passwordHash}, now(), now(), now())
  `;
  await sql`
    insert into knowledge_permissions (id, email, granted_by)
    values (${randomUUID()}, ${email}, 'isolated-e2e')
    on conflict (email) do nothing
  `;

  // This is a disposable localhost-only database. Clearing runtime buckets makes
  // auth/guest E2E deterministic instead of inheriting rate limits from a prior run.
  await sql`delete from rate_limit_buckets`;
  console.log(`Seeded isolated E2E user: ${username}`);
} finally {
  await sql.end();
}
