#!/usr/bin/env bash
# Pre-deployment gate (Phase 7) — run before every push to main / deploy.
# Blocks on: typecheck errors, unit-test failures, regression A<95% or any D,
# a bypassable verification gate / unavailable live search / broken website
# fetch (Rule #7), or a broken production build. Requires: prod DB reachable +
# Ollama running (the regression suite exercises live retrieval).
#
# Env overrides for the live-verification gate:
#   ALLOW_KEYLESS_WEB=1  accept the keyless DuckDuckGo provider (no prod key)
#   SKIP_WEB_SMOKE=1     skip the outbound website-fetch smoke (blocked CI egress)
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── 1/5 typecheck ──"
npx tsc --noEmit

echo "── 2/5 unit tests (non-DB) ──"
# Dummy DATABASE_URL satisfies the prod-DB safety guard; the 3 live-DB
# integration files are excluded here (they need a dedicated test DB).
DATABASE_URL="postgres://test:test@localhost:5432/testdb" npx vitest run \
  --exclude '**/*.db.test.ts' \
  --exclude 'tests/haji-profile-retrieval.test.ts' \
  --exclude 'tests/haji-family-retrieval.test.ts' \
  --exclude 'tests/knowledge-retrieval-regression.test.ts'

# The unit-test-only DATABASE_URL override must never leak into the production
# read-only regression gate below.
unset DATABASE_URL || true

echo "── 3/5 regression gate (102 questions; A>=95%, D=0) ──"
npx tsx scripts/run-regression.mts

echo "── 4/5 live-verification gate (Rule #7) ──"
npx tsx scripts/verify-live.mts

echo "── 5/5 production build ──"
npm run build

echo ""
echo "✅ ALL DEPLOYMENT GATES PASSED — safe to push/deploy."
