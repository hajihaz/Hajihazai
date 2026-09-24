import { z } from "zod";
import type { Tool } from "./types";
import { ToolError } from "./types";

const COMMANDER_TUNNEL_ID = process.env.HHJZ_COMMANDER_TUNNEL_ID || "tunnel_6ab41d9403848191af41352aafaf55d2";
const COMMANDER_MODEL = process.env.HHJZ_COMMANDER_MODEL || "gpt-6-astra";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/**
 * HajiHaz AI -> OpenAI Responses API -> Secure MCP Tunnel -> HajiHaz Commander.
 * The OpenAI API is used only as the MCP-tunnel client; the user's normal
 * HajiHaz model remains responsible for deciding when this tool is needed.
 */
export const hajihazCommanderTool: Tool = {
  name: "hajihaz_commander",
  description:
    "Control HajiHaz Commander on Haji's Mac through the secure OpenAI MCP tunnel. Use this for real Mac work: files, terminal, processes, apps, UI automation, screenshots, Git, PDFs, documents, and other Commander tools. Give a precise natural-language instruction describing the work to perform and verify.",
  inputSchema: z.object({
    instruction: z
      .string()
      .min(1, "instruction is required")
      .max(12_000, "instruction is too long"),
  }),
  async execute(_userId, input) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ToolError(
        "HajiHaz Commander is configured, but HajiHaz AI is missing OPENAI_API_KEY for the Secure MCP Tunnel bridge.",
        "execution_error",
      );
    }

    const instruction = (input as { instruction?: unknown })?.instruction;
    if (typeof instruction !== "string" || !instruction.trim()) {
      throw new ToolError("input.instruction must be a non-empty string", "invalid_input");
    }

    console.info("[commander-bridge] starting Responses API MCP request", {
      model: COMMANDER_MODEL,
      tunnelId: COMMANDER_TUNNEL_ID,
    });
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: COMMANDER_MODEL,
        input: [
          {
            role: "developer",
            content:
              "You are the HajiHaz Commander execution worker. Perform the user's requested Mac operation using the private HajiHaz Commander MCP server. Use the available Commander tools directly; do not merely explain how to do the task. Verify important operations and report the concrete result. Respect any approval/error response from the Commander instead of bypassing it.",
          },
          { role: "user", content: instruction },
        ],
        tools: [
          {
            type: "mcp",
            server_label: "hajihaz_commander",
            tunnel_id: COMMANDER_TUNNEL_ID,
            require_approval: "never",
          },
        ],
        // An explicit Commander request is already an execution request.
        // Force the nested Responses turn to use a tool instead of replying
        // with instructions for the user to operate the Mac manually.
        tool_choice: "required",
      }),
      cache: "no-store",
    });

    console.info("[commander-bridge] Responses API HTTP status", response.status);
    const data = (await response.json()) as {
      output_text?: string;
      error?: { message?: string };
      output?: Array<{ type?: string; name?: string; error?: string; output?: string }>;
    };

    if (!response.ok) {
      console.error("[commander-bridge] Responses API error", {
        status: response.status,
        message: data.error?.message ?? "unknown error",
      });
      throw new ToolError(
        data.error?.message || `OpenAI Commander bridge failed with HTTP ${response.status}`,
        "execution_error",
      );
    }

    const text = typeof data.output_text === "string" ? data.output_text.trim() : "";
    if (text) return { success: true, tunnelId: COMMANDER_TUNNEL_ID, result: text };

    const errors = (data.output || [])
      .filter((item) => item.type === "mcp_call" && item.error)
      .map((item) => `${item.name || "MCP tool"}: ${item.error}`);
    if (errors.length) {
      throw new ToolError(errors.join("; "), "execution_error");
    }

    return {
      success: true,
      tunnelId: COMMANDER_TUNNEL_ID,
      result: "Commander completed the request but returned no textual summary.",
    };
  },
};
