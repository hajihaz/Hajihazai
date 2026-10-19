import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { hhcCommands, hhcDevices, hhcPairings, users } from "@/lib/db/schema";

// Private beta is fail-closed until a separate physical-device pilot is accepted.
export const hhcCustomerEnabled = () => process.env.HHJZ_CUSTOMER_HHC_ENABLED === "1";
function requirePilot() { if (!hhcCustomerEnabled()) throw Error("Customer HHC pilot is not enabled"); }

export const HHC_TOOLS = ["system_info", "git_status", "list_directory", "read_file", "run_command"] as const;
export type HhcTool = typeof HHC_TOOLS[number];
export const HHC_ONLINE_MS = 90_000;
const COMMAND_TTL_MS = 5 * 60_000;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const secret = () => randomBytes(32).toString("base64url");
export const isHhcTool = (v: string): v is HhcTool => (HHC_TOOLS as readonly string[]).includes(v);

export async function assertRealUser(userId: string) {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !u.email || u.email.toLowerCase().endsWith("@guest.hajihaz.ai"))
    throw Error("Sign in to connect your own computer");
}

function validate(tool: HhcTool, args: Record<string, unknown>) {
  if (!args || typeof args !== "object" || Array.isArray(args) || JSON.stringify(args).length > 4096)
    throw Error("Invalid command arguments");
  if (tool === "system_info") return {};
  if (tool === "run_command") {
    if (typeof args.command !== "string" || !args.command.trim() || args.command.length > 1000)
      throw Error("Command must be 1–1000 characters");
    return { command: args.command, ...(typeof args.cwd === "string" && args.cwd.startsWith("/") && args.cwd.length < 4096 ? { cwd: args.cwd } : {}) };
  }
  const k = tool === "git_status" ? "repo" : "path";
  const p = args[k];
  if (typeof p !== "string" || !p.startsWith("/") || p.length > 4096 || p.includes("\0"))
    throw Error("Provide an absolute, permitted local path");
  return { [k]: p };
}

export async function startPairing(userId: string) {
  requirePilot();
  await assertRealUser(userId);
  const pairingCode = secret();
  await db.insert(hhcPairings).values({ codeHash: hash(pairingCode), userId, expiresAt: new Date(Date.now() + 300_000) });
  return { pairingCode, expiresInSeconds: 300 };
}

export async function completePairing(code: string, name: string) {
  requirePilot();
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw Error("Invalid pairing code");
  const [used] = await db.update(hhcPairings).set({ usedAt: new Date() }).where(and(
    eq(hhcPairings.codeHash, hash(code)), isNull(hhcPairings.usedAt), gt(hhcPairings.expiresAt, new Date()),
  )).returning({ userId: hhcPairings.userId });
  if (!used) throw Error("Pairing code expired or already consumed");
  await assertRealUser(used.userId);
  const deviceToken = secret();
  const [device] = await db.insert(hhcDevices).values({
    userId: used.userId, name: name.trim().slice(0, 80) || "My Mac", tokenHash: hash(deviceToken),
  }).returning({ id: hhcDevices.id, name: hhcDevices.name });
  return { device, deviceToken };
}

export async function authenticateDevice(deviceId: string, authorization: string | null) {
  if (!hhcCustomerEnabled()) return null;
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization || "");
  if (!m) return null;
  const [d] = await db.select().from(hhcDevices).where(and(
    eq(hhcDevices.id, deviceId), isNull(hhcDevices.revokedAt),
  )).limit(1);
  if (!d) return null;
  const a = Buffer.from(hash(m[1]), "hex"), b = Buffer.from(d.tokenHash, "hex");
  return b.length === a.length && timingSafeEqual(a, b) ? d : null;
}

export async function listOwnerDevices(userId: string) {
  await assertRealUser(userId);
  const rows = await db.select().from(hhcDevices).where(eq(hhcDevices.userId, userId))
    .orderBy(desc(hhcDevices.createdAt));
  return rows.map(d => ({
    id: d.id, name: d.name, revoked: Boolean(d.revokedAt),
    online: !d.revokedAt && Boolean(d.lastSeenAt && Date.now() - d.lastSeenAt.getTime() < HHC_ONLINE_MS),
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
  }));
}

export async function queueOwnerCommand(userId: string, data: {
  deviceId?: string; tool: string; args: Record<string, unknown>;
}) {
  requirePilot();
  await assertRealUser(userId);
  if (!isHhcTool(data.tool)) throw Error("Computer tool denied");
  const args = validate(data.tool, data.args);
  const rows = await db.select().from(hhcDevices).where(and(
    eq(hhcDevices.userId, userId), isNull(hhcDevices.revokedAt),
    ...(data.deviceId ? [eq(hhcDevices.id, data.deviceId)] : []),
  )).limit(2);
  if (!rows.length) throw Error("No paired computer; connect your own Mac in Devices first");
  if (rows.length !== 1) throw Error("Choose a specific paired computer");
  const d = rows[0];
  if (!d.lastSeenAt || Date.now() - d.lastSeenAt.getTime() > HHC_ONLINE_MS) throw Error("Paired Mac is offline");
  const needsApproval = data.tool !== "system_info";
  const [cmd] = await db.insert(hhcCommands).values({
    userId, deviceId: d.id, tool: data.tool, args,
    status: needsApproval ? "pending_approval" : "queued",
    expiresAt: new Date(Date.now() + COMMAND_TTL_MS),
  }).returning({ id: hhcCommands.id, status: hhcCommands.status });
  return { commandId: cmd.id, deviceId: d.id, deviceName: d.name, status: cmd.status };
}

export async function listOwnerCommands(userId: string) {
  await assertRealUser(userId);
  const rows = await db.select().from(hhcCommands).where(eq(hhcCommands.userId, userId))
    .orderBy(desc(hhcCommands.createdAt)).limit(40);
  return rows.map(c => ({
    id: c.id, deviceId: c.deviceId, tool: c.tool, args: c.args, status: c.status,
    result: c.result, createdAt: c.createdAt.toISOString(), expiresAt: c.expiresAt.toISOString(),
  }));
}

export async function actOnOwnerCommand(userId: string, commandId: string, approve: boolean) {
  requirePilot();
  await assertRealUser(userId);
  const status = approve ? "queued" : "denied";
  const [cmd] = await db.update(hhcCommands).set({ status, ...(!approve ? { finishedAt: new Date() } : {}) })
    .where(and(eq(hhcCommands.id, commandId), eq(hhcCommands.userId, userId),
      eq(hhcCommands.status, "pending_approval"), gt(hhcCommands.expiresAt, new Date())))
    .returning({ id: hhcCommands.id });
  if (!cmd) throw Error("Not found, expired, or no longer awaiting approval");
  return { id: cmd.id, status };
}

export async function revokeOwnerDevice(userId: string, deviceId: string) {
  await assertRealUser(userId);
  const [d] = await db.update(hhcDevices).set({ revokedAt: new Date(), tokenHash: hash(secret()) })
    .where(and(eq(hhcDevices.id, deviceId), eq(hhcDevices.userId, userId), isNull(hhcDevices.revokedAt)))
    .returning({ id: hhcDevices.id });
  if (!d) throw Error("Device not found");
  await db.update(hhcCommands).set({ status: "denied", finishedAt: new Date() })
    .where(and(eq(hhcCommands.deviceId, deviceId), eq(hhcCommands.userId, userId),
      inArray(hhcCommands.status, ["queued", "pending_approval"])));
  return { id: d.id, revoked: true };
}

export async function touchDevice(deviceId: string) {
  await db.update(hhcDevices).set({ lastSeenAt: new Date() })
    .where(and(eq(hhcDevices.id, deviceId), isNull(hhcDevices.revokedAt)));
}

export async function claimCommand(deviceId: string) {
  requirePilot();
  const [candidate] = await db.select().from(hhcCommands).where(and(
    eq(hhcCommands.deviceId, deviceId), eq(hhcCommands.status, "queued"),
    gt(hhcCommands.expiresAt, new Date()),
  )).orderBy(hhcCommands.createdAt).limit(1);
  if (!candidate) return null;
  const [claimed] = await db.update(hhcCommands).set({ status: "running" }).where(and(
    eq(hhcCommands.id, candidate.id), eq(hhcCommands.deviceId, deviceId),
    eq(hhcCommands.status, "queued"), gt(hhcCommands.expiresAt, new Date()),
  )).returning();
  return claimed ? { id: claimed.id, tool: claimed.tool, args: claimed.args } : null;
}

export async function finishCommand(deviceId: string, commandId: string, ok: boolean, result: Record<string, unknown>) {
  requirePilot();
  if (!result || typeof result !== "object" || Array.isArray(result) || JSON.stringify(result).length > 64_000)
    throw Error("Result must be a bounded object");
  const status = ok ? "succeeded" : "failed";
  const [cmd] = await db.update(hhcCommands).set({ status, result, finishedAt: new Date() }).where(and(
    eq(hhcCommands.id, commandId), eq(hhcCommands.deviceId, deviceId),
    eq(hhcCommands.status, "running"), gt(hhcCommands.expiresAt, new Date()),
  )).returning({ id: hhcCommands.id });
  if (!cmd) throw Error("Command not found, expired or already completed");
  return { id: cmd.id, status };
}
