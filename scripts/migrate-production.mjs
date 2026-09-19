import { spawnSync } from "node:child_process";

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
const result = spawnSync("npx", ["drizzle-kit", "migrate"], {
  stdio: "inherit",
  env: process.env,
});
if (result.error) {
  console.error("[db] migration process failed to start:", result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);
