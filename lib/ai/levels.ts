import { MODEL_REGISTRY } from "./registry";
import { isModelUsable } from "./health";

/**
 * Capability levels shown to users instead of raw provider/model names.
 * Users NEVER see Gemini / Groq / OpenRouter / Llama / DeepSeek / Qwen.
 *
 *   LOW    — active, uses the current lowest-cost healthy model
 *   MEDIUM — active, uses the current best healthy model
 *   HIGH   — disabled, "Coming Soon"
 *   MAX    — disabled, "Coming Soon"
 */

export type Level = "low" | "medium" | "high" | "max";

export interface LevelDef {
  level: Level;
  label: string;
  /** false → disabled, rendered greyed-out as "Coming Soon". */
  enabled: boolean;
  /** Ordered routing fallback chain (empty for disabled levels). */
  chain: string[];
}

export const LEVELS: LevelDef[] = [
  {
    level: "low",
    label: "Low",
    enabled: true,
    // Lowest-cost first.
    chain: ["groq:qwen3.6-27b", "openrouter:qwen-2.5-7b", "gemini:2.0-flash"],
  },
  {
    level: "medium",
    label: "Medium",
    enabled: true,
    // Best first.
    chain: ["groq:gpt-oss-120b", "groq:qwen3.6-27b", "gemini:2.0-flash", "openrouter:qwen-2.5-7b"],
  },
  { level: "high", label: "High", enabled: false, chain: [] },
  { level: "max", label: "Max", enabled: false, chain: [] },
];

export interface LevelStatus {
  level: Level;
  label: string;
  enabled: boolean;
  comingSoon: boolean;
  /** Selectable right now (enabled AND at least one model in chain is healthy). */
  available: boolean;
}

type Usable = (modelId: string) => boolean;
const defaultUsable: Usable = (id) => isModelUsable(id);
const has = (id: string) => MODEL_REGISTRY.some((m) => m.modelId === id);

export function isLevel(v: unknown): v is Level {
  return v === "low" || v === "medium" || v === "high" || v === "max";
}

export function isLevelEnabled(level: Level): boolean {
  return LEVELS.find((l) => l.level === level)?.enabled ?? false;
}

/** All four levels with their current selectable/coming-soon status. */
export function listLevels(usable: Usable = defaultUsable): LevelStatus[] {
  return LEVELS.map((d) => ({
    level: d.level,
    label: d.label,
    enabled: d.enabled,
    comingSoon: !d.enabled,
    available: d.enabled && d.chain.some((id) => has(id) && usable(id)),
  }));
}

/** Resolve an enabled level to the first usable model in its chain, or null. */
export function resolveLevel(level: Level, usable: Usable = defaultUsable): string | null {
  const def = LEVELS.find((l) => l.level === level);
  if (!def || !def.enabled) return null;
  for (const id of def.chain) {
    if (has(id) && usable(id)) return id;
  }
  return null;
}

/** The default level to preselect: prefer Medium, else Low, else null. */
export function defaultLevel(usable: Usable = defaultUsable): Level | null {
  const statuses = listLevels(usable);
  const medium = statuses.find((s) => s.level === "medium" && s.available);
  if (medium) return "medium";
  const low = statuses.find((s) => s.level === "low" && s.available);
  return low ? "low" : null;
}
