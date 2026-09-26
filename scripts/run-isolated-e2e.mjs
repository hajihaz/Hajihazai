import { config as loadEnv } from "dotenv";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import net from "node:net";
import postgres from "postgres";

loadEnv({ path: ".env.test", override: true, quiet: true });

const sourceDatabaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || "";
const requestedBaseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
if (!sourceDatabaseUrl) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL in .env.test");

const sourceDbUrl = new URL(sourceDatabaseUrl);
if (!["127.0.0.1", "localhost", "::1"].includes(sourceDbUrl.hostname)) {
  throw new Error(`Refusing isolated E2E against non-local database host: ${sourceDbUrl.hostname}`);
}
const requestedAppUrl = new URL(requestedBaseUrl);
if (!["127.0.0.1", "localhost"].includes(requestedAppUrl.hostname)) {
  throw new Error(`Refusing isolated E2E against non-local app URL: ${requestedBaseUrl}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function portAvailable(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "127.0.0.1", port }, () => server.close(() => resolve(true)));
  });
}

async function choosePort(preferred) {
  // Keep isolated E2E away from common development ports such as 3000/3001.
  if (preferred >= 3100 && preferred < 3200 && await portAvailable(preferred)) return preferred;
  for (let port = 3100; port < 3200; port += 1) {
    if (await portAvailable(port)) return port;
  }
  throw new Error("No free localhost port found for isolated E2E");
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env, shell: false });
  return result.status ?? 1;
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isPortListening(port) {
  if (!Number.isInteger(port) || port <= 0) return false;
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (value) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(300);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function clearStaleNextDevLock() {
  const lockPath = ".next/dev/lock";
  if (!existsSync(lockPath)) return;
  let pid = null;
  let port = null;
  try {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    pid = typeof lock?.pid === "number" ? lock.pid : null;
    port = Number.isInteger(lock?.port) ? lock.port : Number(lock?.port || 0);
  } catch {
    // Broken lock metadata is stale by definition.
  }

  // PID numbers can be recycled after a prior Next process exits. Treat a lock
  // as active only when both its PID still exists and its recorded app port is
  // actually listening. This avoids mistaking an unrelated recycled PID for
  // an active HajiHazai dev server.
  let active = Boolean(pid && processExists(pid) && await isPortListening(port));
  if (active) {
    for (let i = 0; i < 20 && active; i += 1) {
      await sleep(250);
      active = Boolean(pid && processExists(pid) && await isPortListening(port));
    }
  }

  if (!active) {
    try {
      unlinkSync(lockPath);
      console.log("Removed stale Next.js development lock.");
    } catch {
      // Another process may have removed it between the check and unlink.
    }
  } else {
    throw new Error(
      `HajiHazai already has an active Next.js dev server (PID ${pid}, port ${port}). Stop it before running isolated E2E.`,
    );
  }
}

async function waitForServer(baseUrl, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Isolated E2E app server exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      // Server is still starting.
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for isolated E2E app server at ${baseUrl}`);
}

async function stopServer(child) {
  if (!child?.pid || child.exitCode !== null) return;
  const group = -child.pid;
  try {
    process.kill(group, "SIGTERM");
  } catch {
    try { child.kill("SIGTERM"); } catch {}
  }
  for (let i = 0; i < 20 && child.exitCode === null; i += 1) await sleep(100);
  if (child.exitCode === null) {
    try { process.kill(group, "SIGKILL"); } catch {
      try { child.kill("SIGKILL"); } catch {}
    }
  }
}

await clearStaleNextDevLock();

const preferredPort = Number(requestedAppUrl.port || 3000);
const port = await choosePort(preferredPort);
const baseUrl = `http://127.0.0.1:${port}`;

const baseDbName = sourceDbUrl.pathname.slice(1).replace(/[^a-zA-Z0-9_]/g, "_") || "hajihaz_e2e";
const tempDbName = `${baseDbName}_run_${process.pid}_${Date.now()}`;
const adminUrl = new URL(sourceDatabaseUrl);
adminUrl.pathname = "/postgres";
const tempDbUrl = new URL(sourceDatabaseUrl);
tempDbUrl.pathname = `/${tempDbName}`;

const admin = postgres(adminUrl.toString(), { max: 1 });
let databaseCreated = false;
let appServer = null;
let exitCode = 1;
try {
  await admin.unsafe(`create database "${tempDbName}"`);
  databaseCreated = true;

  process.env.DATABASE_URL = tempDbUrl.toString();
  process.env.TEST_DATABASE_URL = tempDbUrl.toString();
  process.env.E2E_BASE_URL = baseUrl;
  process.env.AUTH_URL = baseUrl;
  process.env.LOCAL_E2E_DB = "1";
  process.env.E2E_ALLOW_WRITE = "true";
  process.env.E2E_MANAGED_SERVER = "1";

  const sql = postgres(tempDbUrl.toString(), { max: 1 });
  try {
    await sql`create extension if not exists pgcrypto`;
    await sql`create extension if not exists vector`;
  } finally {
    await sql.end();
  }

  console.log(`Preparing isolated E2E database: ${tempDbName}`);
  console.log(`Isolated E2E app URL: ${baseUrl}`);

  for (const [command, args] of [
    ["npx", ["drizzle-kit", "migrate"]],
    ["node", ["scripts/seed-disposable-db.mjs"]],
    ["node", ["scripts/seed-e2e-user.mjs"]],
  ]) {
    const status = run(command, args);
    if (status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${status}`);
  }

  appServer = spawn(
    "npm",
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", String(port)],
    { env: process.env, stdio: "inherit", detached: true, shell: false },
  );
  await waitForServer(baseUrl, appServer);

  exitCode = run("npx", ["playwright", "test"]);
} finally {
  await stopServer(appServer);

  if (databaseCreated) {
    try {
      await admin.unsafe(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [tempDbName],
      );
      await admin.unsafe(`drop database if exists "${tempDbName}"`);
      console.log(`Dropped isolated E2E database: ${tempDbName}`);
    } catch (error) {
      console.error("Failed to clean up isolated E2E database:", error);
      if (exitCode === 0) exitCode = 1;
    }
  }
  await admin.end();
}

process.exit(exitCode);
