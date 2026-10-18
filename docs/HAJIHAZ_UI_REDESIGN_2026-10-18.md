# HajiHaz AI UI/UX Redesign Audit — 18 October 2026

## Scope

ChatGPT-inspired interaction patterns for **existing HajiHaz AI features only**. Not an attempt to copy ChatGPT's brand, layout pixel for pixel, marketplace, plugins, paid services, or unavailable product capabilities. All changes retain the existing HajiHaz AI identity and underlying API/auth/data architecture.

## Findings addressed

| Area | Before | Implemented now |
| --- | --- | --- |
| Chat header | Crowded horizontal toolbar with a collection of equally weighted action buttons | Small navigation/header actions; secondary tools in contextual menu, response-level selector kept visible |
| Conversation sidebar | Permanently occupying desktop width | Desktop collapse/expand; preference saved locally, mobile drawer still works, `⌘B` toggle |
| Chat composer | Several bordered file/library/image buttons competing with voice/send | Rounded composer, single attachment/tool launcher, visible microphone, stop/send circular buttons and brain control |
| Conversation reading | Both sides in large solid bubbles | User bubble plus editorial-style assistant responses with full Markdown, existing feedback/copy/retry intact |
| Welcome screen | Four feature categories with detailed hard-coded organization-specific examples | Minimal welcome, four neutral grounded starter actions |
| Long chats | Conversation must be manually scrolled to return to the latest turn | Contextual “Latest” jump button |
| Admin dashboard | Wide single-page overview, admin management, and a 14-tab horizontal navigation strip | Overview, People & access, Intelligence and Operations navigation groups; responsive mobile selector |
| Admin analytics | Numerous dashboards and charts always competing for attention | Primary six KPIs first, deep charts and retrieval metrics on demand |
| Admin login | Basic bare form | Branded card, labeled credentials, password visibility, mobile-safe sizes and independent admin-session flow |

## Existing functions preserved

- New chats, project chats and search, chat renaming/archiving/pinning, branch/share.
- Send text, Enter and Shift+Enter handling, attachments, library, image generation, voice transcription and stopping generation.
- Brain Smart/Manual mode, response quality, copy/feedback/retry/edit/delete messages.
- Export to **Markdown, text and Print/PDF**, now in the conversation tools menu.
- Profile menu, notifications, memory, projects and workspace navigation.
- Admin analytics, admin accounts, users, project/document/knowledge/brain management, quality, permissions, notifications, audit, health and maintenance.

## Accessibility, mobile and reliability

- Icon-only controls are labeled; menus expose expanded state; keyboard Escape closes menus; chat composer remains available at 320 px.
- React hydration readiness is explicitly testable (`data-app-ready`) to avoid false interactions with unhydrated server-rendered controls.
- Next.js development indicator is disabled so its floating badge does not intercept the small-screen attachment button during real pointer-based tests; production is not affected.
- The guest five-message gate and guest-to-account conversation persistence remain enforced in their existing server/auth paths.
- Unrelated local/untracked files are preserved.

## Local acceptance checks

- TypeScript: `npm run typecheck`.
- Isolated, disposable-DB Playwright: chat composer, sidebar toggling, menus and all export formats; 320/390/430 mobile; guest login gate and preserved chat; authenticated desktop/mobile admin navigation.
- Predeploy: non-DB tests, 102-question regression, live-web gate, and production build.
- Production: Vercel READY and public smoke/auth protection before calling the release verified.

## Explicit exclusions

No fictional plugins, new API keys, paid providers, additional model entitlements, live voice-to-voice assistant, or image-provider promises were added. HajiHaz AI's voice input is speech-to-text using supported browsers, **not a full realtime voice conversation engine**. Existing external provider billing/quota blockers remain separate from this frontend delivery.
