import type { Tool } from "./types";
import { memorySearchTool } from "./memory-search";
import { knowledgeSearchTool } from "./knowledge-search";
import { calculatorTool } from "./calculator";
import { currentTimeTool } from "./current-time";
import { hajihazCommanderTool } from "./hajihaz-commander";

/**
 * Single source of truth for available tools (Phase 8.0).
 * Deterministic tools only — no agents / loops / autonomy.
 */
export const TOOLS: Tool[] = [
  memorySearchTool,
  knowledgeSearchTool,
  calculatorTool,
  currentTimeTool,
  hajihazCommanderTool,
];

const TOOL_MAP: Record<string, Tool> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

export function getTool(name: string): Tool | null {
  return TOOL_MAP[name] ?? null;
}

export function listTools(): Array<{ name: string; description: string }> {
  return TOOLS.map((t) => ({ name: t.name, description: t.description }));
}
