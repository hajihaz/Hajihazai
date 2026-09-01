# HajiHaz AI — Production Deployment Checklist

Target: **GitHub → Vercel → hajihazai.com**, with **Neon** (Postgres + pgvector).

> ⚠️ **Hard blocker:** Vercel has **no Ollama**. In production the router order is
> Groq → OpenRouter → Gemini → Ollama, with Ollama unavailable on Vercel. **You MUST set
> at least one cloud model key** (Groq, OpenRouter, or Gemini) or chat returns "could not
> reach any provider" and tools never fire.

---

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | ✅ **Required** | Neon pooled connection string (`?sslmode=require`). Without it, queries fail at runtime (the app boots, but every DB call errors). |
| `AUTH_SECRET` | ✅ **Required** | `npx auth secret`. Auth.js will not issue sessions without it. |
| `AUTH_URL` | ✅ Prod | `https://hajihazai.com`. |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | ✅ Required | GitHub OAuth app (callback `https://hajihazai.com/api/auth/callback/github`). |
| `GOOGLE_GENERATIVE_AI_API_KEY` | ⚠️ **One of these two required** | Gemini (production default model). |
| `OPENROUTER_API_KEY` | ⚠️ **One of these two required** | OpenRouter (fallback). Set at least one of Gemini/OpenRouter. |
| `OLLAMA_BASE_URL` | ❌ Omit in prod | Only set if you run a self-hosted Ollama gateway. Absent ⇒ Ollama unavailable (expected on Vercel). |
| `NEXT_PUBLIC_APP_URL` | ✅ Prod | `https://hajihazai.com` (used as OpenRouter referer). |
| `RESEND_API_KEY` / `EMAIL_FROM` | ⚠️ Password reset | Resend HTTPS delivery; without these the reset flow remains generic but no email is delivered. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | ⚠️ Scale | Shared fixed-window rate limiting across Vercel instances; memory fallback remains available. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | ⚠️ Monitoring | Enables Sentry server/edge/client error monitoring. `SENTRY_AUTH_TOKEN` is optional for source-map upload. |
| `TAVILY_API_KEY` *(or `BRAVE_SEARCH_API_KEY` / `SERPER_API_KEY`)* | ⚠️ **Required for current events** | Live-search provider for current-event verification. Without one, current-event queries **refuse** (never guess) — see §9. Website summarization needs no key. |

## 9. Live web search & the verification gate (anti-hallucination)

Current-event and website questions go through a **hard verification gate** (`lib/web/verify.ts`) — the model is only allowed to answer the live/external part after a **successful** live lookup:

- **Current events** (office-holders, news, prices, weather, scores, "who is X", rankings…) → require a live **search**. No results / no provider ⇒ the route streams *"I couldn't verify this information from a live source."* and **never** calls the model. Configure a search key above for these to actually answer.
- **Website summaries** ("summarize xyz.com") → require a live **page fetch** (no search key needed; SSRF-guarded). Fetch fails ⇒ *"I couldn't access this website."* — never a fabricated summary.
- **Provider status** is visible in **Admin → Data → Live Web Search** (shows provider, `productionGrade`, and a warning when only the keyless fallback is available).
- **Deploy gate:** `scripts/verify-live.mts` (wired into `predeploy.sh`) fails the deploy if the gate is bypassable, no search provider is configured, or the website fetch is broken. Overrides: `ALLOW_KEYLESS_WEB=1` (accept keyless DuckDuckGo), `SKIP_WEB_SMOKE=1` (skip the outbound fetch check in restricted CI).

> Policy: **truthfulness > completeness**. With no search key, expect current-event questions to refuse rather than answer — that is intended. Add a key to turn them on.

## 2. Neon
- [ ] Project created; **pgvector extension** is created automatically by migration `0004` (`CREATE EXTENSION IF NOT EXISTS vector`).
- [ ] Run migrations against prod: `DATABASE_URL=<prod> npm run db:migrate` (applies the full migration journal through the current release).
- [ ] Verify HNSW indexes exist on `user_memory.embedding` and `knowledge_chunk.embedding`.
- [ ] Use the **pooled** connection string for serverless.

## 3. Vercel
- [ ] Framework preset: Next.js. Build = `next build`.
- [ ] All env vars above set for **Production** (and Preview if needed).
- [ ] Domain `hajihazai.com` attached.
- [ ] Note: migrations are **not** run by the build — run them manually (step 2) before/after deploy.

## 4. Auth
- [ ] GitHub OAuth callback URL matches the deployed domain.
- [ ] `AUTH_SECRET` set; sessions are **database-backed** (Neon `session` table) — confirm Neon reachable.

## 5. Models
- [ ] **Ollama:** not used in prod (no gateway). Local dev only.
- [ ] **Gemini:** key set → available in the production routing chain. Native tool-calling is covered by the provider contract tests; live smoke-test after deployment.
- [ ] **OpenRouter:** key set → fallback. Native tool-calling is covered by the provider contract tests; live smoke-test after deployment.
- [ ] After deploy, confirm a chat message that needs a tool actually executes one (check `/tools/history`).

## 6. Rate limiting
- [x] Shared rate limiting implemented with `UpstashRateLimiter` and used by rate-limited API routes.
- [ ] Configure Upstash production credentials; if unavailable, the app safely falls back to per-instance memory limiting.
- [ ] Per-route limits: `/api/chat` 30/min, `/api/tools` 60/min, memory/knowledge routes 5–30/min.

## 7. Monitoring
- [x] Sentry error monitoring integration added for client, server and edge runtimes; enable with DSN env vars.
- [ ] Add LLM tracing (e.g. Langfuse) if deeper prompt/provider traces are needed at scale.
- [ ] Tool calls are audited in `tool_invocation` (view at `/tools/history`).
- [ ] Set up Neon storage/compute alerts; plan retention for `message` and `tool_invocation` (no TTL today).

## 8. Post-deploy smoke test
- [ ] Sign in with GitHub.
- [ ] Send a normal chat message → response returned.
- [ ] Send "what is 22 * 475000" → calculator tool executes (verify in `/tools/history`).
- [ ] Upload a knowledge doc → chunk → embed → ask a grounded question.
- [ ] Confirm memory persists across logout/login.
