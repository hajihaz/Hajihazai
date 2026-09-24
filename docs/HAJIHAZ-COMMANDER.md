# HajiHaz AI ↔ HajiHaz Commander

## Architecture

HajiHaz AI uses the `hajihaz_commander` native tool. That tool delegates the requested Mac operation to the OpenAI Responses API, which connects to the existing Secure MCP Tunnel by `tunnel_id`. The tunnel-client on Haji's Mac forwards the MCP request to the local HajiHaz Commander stdio server.

```text
HajiHaz AI
   │ native tool: hajihaz_commander
   ▼
OpenAI Responses API
   │ MCP tool + tunnel_id
   ▼
OpenAI Secure MCP Tunnel
   │ outbound-only queue
   ▼
tunnel-client on Mac
   │ stdio
   ▼
HajiHaz Commander
   ├── Files
   ├── Terminal
   ├── Processes
   ├── UI / Apps
   ├── Screenshots
   ├── Git
   └── Documents / PDF
```

ChatGPT can use the same tunnel independently through its Tunnel connector. The local tunnel-client remains the single Mac execution boundary.

## Required production environment

Add these Vercel environment variables to HajiHaz AI:

- `OPENAI_API_KEY` — an OpenAI API key authorized to use Responses API and the target tunnel.
- `HHJZ_COMMANDER_TUNNEL_ID` — the OpenAI Secure MCP Tunnel ID. The code currently defaults to the HajiHaz Commander tunnel, but keeping it as an environment variable makes rotation explicit.
- `HHJZ_COMMANDER_MODEL` — optional Responses API model override; defaults to `gpt-5.4`.

Do not put the tunnel runtime API key in HajiHaz AI. That key belongs only to the local `tunnel-client` daemon.

## Security

The HajiHaz AI bridge does not expose port 8787 or the local MCP server publicly. The Mac continues to use the outbound-only OpenAI tunnel. Destructive actions remain subject to HajiHaz Commander's own authorization/approval gate.
