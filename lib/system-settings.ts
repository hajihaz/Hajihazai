import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { systemSettings } from "@/lib/db/schema";

/** In-process cache so maintenance checks don't hit the DB on every request. */
const CACHE: Record<string, { value: string; expiresAt: number }> = {};
const CACHE_TTL_MS = 30_000;

async function getSetting(key: string): Promise<string | null> {
  const cached = CACHE[key];
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [row] = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);

  const value = row?.value ?? null;
  if (value !== null) {
    CACHE[key] = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return value;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date() },
    });
  delete CACHE[key];
}

export async function isMaintenanceMode(): Promise<boolean> {
  const val = await getSetting("maintenance_mode").catch(() => null);
  return val === "true";
}

export async function setMaintenanceMode(enabled: boolean): Promise<void> {
  await setSetting("maintenance_mode", enabled ? "true" : "false");
}

export async function getMaintenanceMessage(): Promise<string> {
  const val = await getSetting("maintenance_message").catch(() => null);
  return val ?? "HajiHaz AI is currently undergoing maintenance. We'll be back shortly.";
}

export async function setMaintenanceMessage(message: string): Promise<void> {
  await setSetting("maintenance_message", message);
}

/* -------------------- Live web search (Phase 7 toggle) -------------------- */

/** Web search is ON by default; admins can disable it. */
export async function isWebSearchEnabled(): Promise<boolean> {
  const val = await getSetting("web_search_enabled").catch(() => null);
  return val !== "false"; // default enabled
}

export async function setWebSearchEnabled(enabled: boolean): Promise<void> {
  await setSetting("web_search_enabled", enabled ? "true" : "false");
}
