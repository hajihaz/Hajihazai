import { z } from "zod";
import type { Tool } from "./types";
import { ToolError } from "./types";
import { queueOwnerCommand } from "@/lib/hhc/customer-bridge";

/**
 * Customer HHC execution is always routed through an account-owned paired
 * device. No shared MCP tunnel ID, credential or fallback is permitted.
 * A requested command is an audited queue entry, not proof of execution.
 */
export const hajihazCommanderTool: Tool = {
  name: "hajihaz_commander",
  description:
    "Use the signed-in user's own paired HHC computer, never any other Mac. For information choose tool=system_info (empty arguments); for workspace tasks choose git_status, list_directory or read_file with explicit paths. run_command needs account approval AND local Mac approval. Commands may be queued; do not claim execution until a confirmed result is received. Require deviceId when multiple computers are paired.",
  inputSchema: z.object({
    instruction: z.string().min(1).max(12_000),
    deviceId: z.string().uuid().optional(),
    tool: z.enum(["system_info", "git_status", "list_directory", "read_file", "run_command"]).optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
  }),
  async execute(userId, input) {
    const { instruction, deviceId, tool, arguments: args } = input as {
      instruction: string;
      deviceId?: string;
      tool?: string;
      arguments?: Record<string, unknown>;
    };
    // Only simple, non-destructive informational intents may be inferred.
    const operation = tool || (/\b(system info|system information|mac status|computer status|mac specs)\b/i.test(instruction)
      ? "system_info"
      : undefined);
    if (!operation) {
      throw new ToolError(
        "Select a concrete computer operation and its required arguments. No computer was accessed.",
        "invalid_input",
      );
    }
    try {
      const queued = await queueOwnerCommand(userId, { deviceId, tool: operation, args: args ?? {} });
      return {
        success: true,
        executed: false,
        ...queued,
        message: queued.status === "pending_approval"
          ? "Awaiting account approval in Devices; the Mac must also approve locally."
          : "Sent only to your paired device. Check Devices for a verified result.",
      };
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : "Device command denied", "execution_error");
    }
  },
};
