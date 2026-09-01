import { listEnabledModels, MODEL_REGISTRY, type ModelEntry } from "./registry";
import { providers } from "./providers";
import type { ChatMessage } from "./types";

/**
 * Model health tracking (server-only).
 * Runtime outcomes and active probes feed this store. Transient provider
 * failures get a short quarantine; persistent configuration/model failures
 * retain the normal TTL so routing can recover quickly without thrashing.
 */

export interface ModelHealth {
  modelId: string;
  healthy: boolean;
  checkedAt: number;
  latencyMs?: number;
  error?: string;
  retryAfterMs?: number;
  unhealthyUntil?: number;
}

const HEALTH_TTL_MS = 5 * 60_000;
const TRANSIENT_COOLDOWN_MS = 15_000;
const TIMEOUT_COOLDOWN_MS = 30_000;
const PROBE_TIMEOUT_MS = 8_000;
const PROBE_COOLDOWN_MS = 60_000;

const store = new Map<string, ModelHealth>();
let lastProbeAll = 0;

export function recordSuccess(modelId: string, latencyMs?: number): void {
  store.set(modelId, { modelId, healthy: true, checkedAt: Date.now(), latencyMs });
}

export function recordFailure(modelId: string, error: string): void {
  const now = Date.now();
  const normalized = error.toLowerCase();
  const transient = /\b429\b|rate.?limit|too many requests|\b5(?:00|02|03|04)\b|temporarily unavailable|econnreset|enotfound/.test(normalized);
  const timeout = /timeout|timed out|abort/.test(normalized);
  const retryAfterMs = transient ? TRANSIENT_COOLDOWN_MS : timeout ? TIMEOUT_COOLDOWN_MS : HEALTH_TTL_MS;
  console.warn(`[health] model unhealthy: ${modelId} — ${error} (retry in ${retryAfterMs}ms)`);
  store.set(modelId, {
    modelId,
    healthy: false,
    checkedAt: now,
    error,
    retryAfterMs,
    unhealthyUntil: now + retryAfterMs,
  });
}

function fresh(h: ModelHealth | undefined): ModelHealth | undefined {
  if (!h) return undefined;
  const expiresAt = h.unhealthyUntil ?? h.checkedAt + HEALTH_TTL_MS;
  return Date.now() <= expiresAt ? h : undefined;
}

export function getHealth(modelId: string): ModelHealth | undefined {
  return fresh(store.get(modelId));
}

export function isKnownUnhealthy(modelId: string): boolean {
  return getHealth(modelId)?.healthy === false;
}

const entryById = (id: string): ModelEntry | undefined =>
  MODEL_REGISTRY.find((m) => m.modelId === id);

/** Provider key present AND not currently known-unhealthy. */
export function isModelUsable(idOrEntry: string | ModelEntry): boolean {
  const entry = typeof idOrEntry === "string" ? entryById(idOrEntry) : idOrEntry;
  if (!entry || !entry.enabled) return false;
  if (!providers[entry.provider]?.isAvailable()) return false;
  return !isKnownUnhealthy(entry.modelId);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`probe timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const PROBE_PROMPT: ChatMessage[] = [{ role: "user", content: "ping" }];

/** Actively probe a single model and record the outcome. */
export async function probeModel(entry: ModelEntry): Promise<ModelHealth> {
  if (!providers[entry.provider]?.isAvailable()) {
    recordFailure(entry.modelId, "provider unavailable (no API key)");
    return store.get(entry.modelId)!;
  }
  const start = Date.now();
  try {
    const text = await withTimeout(
      providers[entry.provider].generate(entry.model, PROBE_PROMPT),
      PROBE_TIMEOUT_MS,
    );
    if (text && text.trim()) recordSuccess(entry.modelId, Date.now() - start);
    else recordFailure(entry.modelId, "empty response");
  } catch (err) {
    recordFailure(entry.modelId, err instanceof Error ? err.message : String(err));
  }
  return store.get(entry.modelId)!;
}

/** Probe enabled models that lack a fresh health result. */
export async function probeAll(opts: { force?: boolean } = {}): Promise<ModelHealth[]> {
  const now = Date.now();
  const models = listEnabledModels();
  const stale = models.filter((m) => opts.force || !getHealth(m.modelId));
  if (stale.length > 0 && (opts.force || now - lastProbeAll > PROBE_COOLDOWN_MS)) {
    lastProbeAll = now;
    await Promise.all(stale.map((m) => probeModel(m)));
  }
  return models.map(
    (m) => getHealth(m.modelId) ?? { modelId: m.modelId, healthy: false, checkedAt: now },
  );
}
