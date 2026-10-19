# HajiHaz AI × HHC — Customer Mac private pilot

**Release objective:** Let a signed-in HajiHaz AI customer use HHC exclusively
on their own installed and authorized Mac. No customer may access Haji's Mac.

## Implemented pre-pilot capabilities

- Per-account device registry; one-time pairing token and distinct credential
  stored by the customer's agent in macOS Keychain
- Customer connector only makes outbound HTTPS requests; no shared HHC owner
  tunnel is used for customer tool execution
- Owner-scoped command queue, individual status/result reads, finite TTL and
  cancellation for work not yet claimed by the Mac
- Separate web-account approval and per-action macOS local consent, with
  full action disclosure; denial, oversized prompts and timeouts fail closed
- Chat-native status card: queued, account approval, running, completed,
  failed, cancelled or expired; result only after device confirmation
- No automatic replay of an already claimed real-world command after transport
  failure; a new request requires explicit user action
- Automatic reconnect after macOS login for an already enrolled customer Mac,
  opt-in after first local installation/authorization
- Customer preflight diagnostic in HHC: npm run customer:doctor on the
  customer's Mac; read-only and does not print credentials

## Verification required before private-beta activation

1. Distinct consenting customer-owned Mac (never the owner Mac) must run
   the actual client, including first-time user installation and OS prompts.
2. Pair to a disposable ordinary customer account; demonstrate login,
   fresh browser session, Mac logout/login, sleep/wake, offline/online recovery.
3. Exercise system_info, read_file, git_status, run_command on allowed
   roots only. Reject forbidden roots; no broad owner privileges.
4. Prove two accounts cannot list, approve, cancel, read results for,
   or revoke each other's computers. Repeat with guessed IDs.
5. Deny/timeout local consent. Revoke queued and offline; confirm blocked
   poll. Never claim a running OS side effect was rolled back.
6. Inspect local Keychain persistence, no secrets in login plists or logs;
   verify code signing and Apple notarization before public distribution.
7. Owner reviews infrastructure costs, auth, telemetry, limits, rollback
   and privacy terms; only then set HHJZ_CUSTOMER_HHC_ENABLED=1 in the
   controlled pilot.

## Current deployment and rollback

The Vercel environment has no HHJZ_CUSTOMER_HHC_ENABLED value, so pairing
and execution are disabled. Keep that state until acceptance passes.
For an emergency, unset the feature flag and redeploy; verify agent routes
reject requests and normal chat works. A physical customer-Mac pilot and
signed public installer have not yet been verified.

## Evidence review

- Isolated PostgreSQL/Chromium tests for two-user isolation, pairing, queue,
  status read, account approval, local consent policy, cancellation, revocation
- HajiHaz AI regression and predeployment build pass
- HHC local build, unit and doctor tests pass without using the owner Mac as
  any customer's execution machine
- Vercel READY for matching commit; smoke tests and API denial verified.
