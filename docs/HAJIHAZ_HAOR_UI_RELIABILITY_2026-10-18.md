# HajiHaz AI — HAOR autonomous QA and reliability batch

## Scope and methodology

Owner approved NPWWMI #1–#12: comprehensive chat/admin UI, performance, PWA, guest auth, accessibility, backend and security improvements without additional API keys or paid services. The primary goal is evidence-based safe changes rather than new, unrelated product features. Audited the existing Next.js app, 84-ish route architecture, upload/chat flows, admin tab dependencies, guest gate, service worker, database query/index pattern, dependencies, and automated browser coverage.

## Changes and evidence for approved workstreams

| # | Workstream | Evidence / result |
|---|---|---|
| 1 | Full chat/admin audit | Inspected repo, API/auth route guards, production configuration, browser E2E and current owner feature scope; existing features retained |
| 2 | Composer, attachments and voice | Uploaded documents still get one response; file picker, drag-drop and pasted images now respect the upload API's 5 MB maximum; voice dictation regression covered |
| 3 | Admin loading and search | Admin home bootstraps admin identity and overview only; user, knowledge, picker and brain datasets load on the relevant tab. Deduplicates Strict Mode bootstrap; user searches use request sequence so stale responses cannot overwrite recent results |
| 4 | Chat history and navigation | Stale conversation/history requests can no longer overwrite another newly opened conversation. Conversation list receives a composite (user, archived, updatedAt) DB index, and project-rename regression targets current sidebar controls |
| 5 | Guest five-turn gate | Durable, atomic guest quota meter; overlapping fifth-turn requests cannot both claim capacity; deleting chat history doesn't regenerate free turns; reentering the guest API preserves the existing identity rather than resetting usage |
| 6 | Themes and mobile | Restored light/dark setting initializes before OS-mode changes can overwrite local preference; mobile theme persistence and 320–430 px layout covered by browser tests |
| 7 | Accessibility | Existing icon names/sidebar `inert`, dialog and menu keyboard access preserved; test covers responsive drawer and theme toggles. More manual assistive-tech review is useful before claiming formal WCAG conformance |
| 8 | Frontend efficiency | Audited generated chunk sizes and request waterfall; deferred admin datasets and network calls until needed. No fabricated quantitative latency improvement without measurements |
| 9 | PWA and offline | Static cache bounded to 150 assets; branding/images refreshed network-first, content-hashed Next.js assets cache-first. Service worker update checks on return-to-app when online, up to hourly; never caches API or authenticated pages |
| 10 | Security, database, concurrency | Atomic guest quota + composite sidebar index, route-auth heuristic review, dependency audit and safe Next.js/undici patch upgrades. Critical/high findings cleared, residual moderate issues documented below |
| 11 | Regression expansion | Disposable database E2E exercises security and concurrency, admin on-demand loading, chat race, file-size validation, theme, voice, PWA, memory, projects, file library and artifacts; unit gates retained |
| 12 | Release acceptance | Run TypeScript, unit/regression/web gates, production build, deployment and production smoke and record exact results. Only call production verified after deployment is READY |

## Known limitations and deferred gates

- `npm audit --omit=dev` still reports five **moderate** findings associated with `mammoth` -> `argparse` -> `sprintf-js` and `@tailwindcss/typography` -> `postcss-selector-parser`. Automated force-fix suggests breaking version downgrades, so these are not forced into production without compatibility evidence. Zero reported **high** or **critical** dependencies after the safe upgrade.
- The quota meter is atomic even under concurrent requests but a reservation could be consumed by a database failure occurring before message insertion. This is preferable to allowing the 5-message limit to be bypassed but can be improved with an atomic insert-and-reserve transaction later.
- Guest access is restricted per temporary guest account and rate limited at guest entry; deleting browser storage and creating another new guest identity is not a guaranteed one-device lifetime ban.
- A PWA cannot serve personalized authenticated data while offline because sensitive dynamic routes are explicitly network-only. The offline shell and static assets remain available.
- Provider-billing/image-generation external live checks remain blocked separately as previously agreed.
- Do not treat automated test success as a claim of absolute security, complete WCAG compliance, or pixel-perfect UX on untested physical devices.

## Safety

No owner credentials, live production data, or paid services are required to run the isolated test suite. New migrations are additive only: one integer guest quota column with default 0 and one composite conversation index. Existing user chats/documents are not deleted or reset. Preserve untracked `.ai/`, `AGENTS.md`, `docs/tmp.pdf`, and `test-results/`.
