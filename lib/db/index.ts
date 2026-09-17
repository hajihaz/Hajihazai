import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import postgres from "postgres";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

/**
 * Production/preview uses Neon HTTP. Local E2E can opt into native PostgreSQL
 * with LOCAL_E2E_DB=1, keeping test writes physically isolated from production.
 */
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://placeholder:placeholder@localhost:5432/placeholder";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set — database queries will fail at runtime.");
}

const neonDb = drizzleNeon(neon(connectionString), { schema });

// The local branch is created only for explicitly opted-in E2E processes. The
// exported type remains pinned to the production Neon dialect for existing
// Neon-specific execute() callers while the runtime driver is interchangeable.
export const db = (
  process.env.LOCAL_E2E_DB === "1"
    ? drizzlePostgres(postgres(connectionString), { schema })
    : neonDb
) as typeof neonDb;

export * from "./schema";
