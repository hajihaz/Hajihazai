#!/usr/bin/env bash
# Pre-deployment gate (Phase 7) — run before every push to main / deploy.
# Blocks on: typecheck errors, unit-test failures, regression A<95% or any D,
# or a broken production build. Requires: prod DB reachable + Ollama running
# (the regression suite exercises live retrieval).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "── 1/4 typecheck ──"
npx tsc --noEmit

echo "── 2/4 unit tests (non-DB) ──"
# Dummy DATABASE_URL satisfies the prod-DB safety guard; the 3 live-DB
# integration files are excluded here (they need a dedicated test DB).
DATABASE_URL="postgres://test:test@localhost:5432/testdb" npx vitest run \
  --exclude '**/*.db.test.ts' \
  --exclude 'tests/haji-profile-retrieval.test.ts' \
  --exclude 'tests/haji-family-retrieval.test.ts' \
  --exclude 'tests/knowledge-retrieval-regression.test.ts'

echo "── 3/4 regression gate (102 questions; A>=95%, D=0) ──"
npx tsx scripts/run-regression.mts

echo "── 4/4 production build ──"
npm run build

echo ""
echo "✅ ALL DEPLOYMENT GATES PASSED — safe to push/deploy."
