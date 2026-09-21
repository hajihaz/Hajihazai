import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const isVercelProduction = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";

if (!isVercelProduction) {
  console.log("[db] production migration skipped outside Vercel production builds");
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[db] DATABASE_URL is required for Vercel production migration");
  process.exit(1);
}

console.log("[db] applying Drizzle migrations before the production build");
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  onnotice: (notice) => console.log("[db] postgres notice:", notice.message),
});
const db = drizzle(sql);

try {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("[db] production migrations applied successfully");
} catch (error) {
  console.error("[db] production migration failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
