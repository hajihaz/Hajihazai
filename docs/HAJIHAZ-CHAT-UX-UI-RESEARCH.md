# HajiHaz AI — Selective ChatGPT UI analysis and open-source integration

Status: scoped UI implementation; not a ChatGPT clone. Updated 2026-10-20.

## Product goal

Make HajiHaz AI easy to navigate, understandable on mobile, accessible with keyboard and
screen readers, fast when responses stream, and consistent with our own identity.
The analysis uses observable interaction patterns and open-source references.
No private ChatGPT code, hidden interfaces, distinctive logos, trade dress, or assets
are copied. HajiHaz AI remains the product and source of truth.

## Feature-by-feature scope

| Public chat-UX pattern | Existing HajiHaz AI | This batch |
| --- | --- | --- |
| Quiet single-column chat and simple empty state | Already available | Preserve HajiHaz mark, own copy and suggestions |
| Conversations, projects, sidebar and recent history | Already available | Quick search across user-owned chats and projects |
| Quick keyboard navigation | Cmd/Ctrl+B sidebar, Cmd/Ctrl+N new | Cmd/Ctrl+K command menu, / focuses composer outside editable controls |
| Model/response quality control | Existing response-quality selector | Preserve provider router; avoid duplicate model toggles |
| Message copy/edit/regenerate/feedback | Already available | Preserve |
| Voice dictation and file/image composer tools | Already available | Expose those actions in quick menu |
| Streaming Markdown and fenced code | Already available | Add own readable copy-code action (no HTML injection) |
| Customer-controlled Mac (HHC) | Already implemented, pilot disabled | Link My Computer; never silently enable execution |
| Research/source links and project context | Already available | Preserve existing citations, no external content trust bypass |
| Store, paid tiers, plugin directory, app marketplace | Not part of this scope | Not implemented |

## Open-source audit

1. **[cmdk](https://github.com/dip/cmdk)** — MIT, currently version 1.1.1, React 19-compatible.
   Selected for accessible filtered navigation and small scoped integration.
2. **[assistant-ui](https://github.com/assistant-ui/assistant-ui)** — MIT, powerful composable
   chat runtime. A whole runtime replacement would be risky: our current SSE,
   per-account persistence, HHC event metadata, guest quota, intelligence routing,
   admin roles, document uploads and provider fallbacks would require a migration.
   Use as design inspiration now; run an isolated adapter PoC before adopting.
3. **[AI Elements](https://github.com/vercel/ai-elements)** — Apache-2.0, copyable
   AI-native UI components. The own compact copyable code renderer follows
   general compositional design rather than importing AI Elements' files verbatim.
   Evaluate individual elements only when needed; review transitive dependencies.
4. **[Vercel AI SDK](https://github.com/vercel/ai)** — useful multi-provider interface;
   existing HajiHaz AI provider and SSE paths are stable. Do not modify live
   streaming or providers without a dedicated parity/fallback/security suite.
5. **[Promptfoo](https://github.com/promptfoo/promptfoo)** — candidate evaluation
   harness; preserve existing 102-question regression before introducing any paid API.
6. **[pgvector](https://github.com/pgvector/pgvector)** — existing app already declares
   Drizzle vector use and Postgres. Feasibility audit is preferred over a new
   database service or destructive schema changes.

## Implementation boundaries

- No external API costs, provider changes, database schema changes, paid plugins,
  new user data sharing, or external code execution.
- Search results are limited to the conversations/projects already loaded for
  the signed-in user. No shared account index or cross-user retrieval.
- Use the existing project, image, file, and chat actions.
- Preserve current sidebar search, mobile sidebar, conversation keyboard shortcuts,
  message actions, stop generation, voice, attachments, and admin UX.
- All HHC enrollment/execution remains disabled without real physical customer
  Mac acceptance, regardless of the UI shortcut link.
- Show only actual available features; no inactive decorative controls.

## Acceptance checks

- TypeScript, unit suite, 102-question AI regression, production build and security audit.
- Isolated Chromium covers Cmd/Ctrl+K opening/focus/Escape, searching existing
  owned conversation, new chat, / composer focus, mobile width and composer tools,
  fenced code rendering with copy control.
- Existing chat UI, sidebar, tool buttons, voice and guest E2E checks remain green.
- Verify production Vercel READY, exact commit, smoke, unauthenticated endpoints,
  and absent customer HHC enable flag before reporting deployed.

This work is scoped to common public interaction patterns; it is not a claim to
reverse engineer ChatGPT's private implementation.
