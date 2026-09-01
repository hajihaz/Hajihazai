/**
 * Live-verification deployment gate (Rule #7).
 *
 * Fails the deploy (exit 1) when the anti-hallucination guarantees are not met:
 *   1. Verification gate integrity — the pure gate must never let a
 *      verification-required query answer without a successful lookup. (Always
 *      checked; no network.)
 *   2. Live verification availability — a production-grade search provider must
 *      be configured (TAVILY/BRAVE/SERPER). Override for keyless/preview envs
 *      with ALLOW_KEYLESS_WEB=1.
 *   3. Website fetch capability — a real fetch of a known-good page must succeed.
 *      Skip in network-restricted CI with SKIP_WEB_SMOKE=1.
 *
 * Run: npx tsx scripts/verify-live.mts
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local (best-effort) so provider keys are visible, matching run-regression.
try {
  for (const l of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
    const t = l.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[k]) process.env[k] = v;
  }
} catch {
  /* no .env.local — rely on the ambient environment */
}

const { decideGate } = await import("../lib/web/verify.ts");
const { hasProductionGradeProvider, activeProvider } = await import("../lib/web/search.ts");
const { fetchWebsite } = await import("../lib/web/fetch-url.ts");
const { webSearchMany } = await import("../lib/web/search.ts");

const failures: string[] = [];
const ok = (m: string) => console.log(`  ✅ ${m}`);
const bad = (m: string) => { failures.push(m); console.log(`  ❌ ${m}`); };

/* 1) Gate integrity — no verification-required + failed path may answer. */
console.log("── 1/4 verification-gate integrity ──");
{
  const intents = ["internal", "web", "hybrid", "website"] as const;
  const b = [false, true];
  let bypass = 0;
  for (const intent of intents)
    for (const searchEnabled of b)
      for (const searchAttempted of b)
        for (const searchResultCount of [0, 5])
          for (const trustedResultCount of [0, 1])
          for (const fetchAttempted of b)
            for (const fetchOk of b)
              for (const internalKnowledgeCount of [0, 3]) {
                const d = decideGate({ intent, searchEnabled, searchAttempted, searchResultCount, trustedResultCount, fetchAttempted, fetchOk, internalKnowledgeCount });
                if (intent === "web" && d.action === "answer_web" && !(searchAttempted && searchResultCount > 0 && trustedResultCount > 0)) bypass++;
                if (intent === "website" && d.action === "answer_website" && !(fetchAttempted && fetchOk)) bypass++;
                if (intent === "web" && !(searchEnabled && searchAttempted && searchResultCount > 0 && trustedResultCount > 0) && d.action.startsWith("answer")) bypass++;
                if (intent === "website" && !(fetchAttempted && fetchOk) && d.action.startsWith("answer")) bypass++;
              }
  if (bypass === 0) ok("no verification-required query can answer without a successful lookup");
  else bad(`gate bypassed in ${bypass} case(s) — a failed verification could still answer`);
}

/* 2) Live verification availability. */
console.log("── 2/4 live search provider ──");
{
  const allowKeyless = process.env.ALLOW_KEYLESS_WEB === "1";
  if (hasProductionGradeProvider()) ok(`production-grade provider configured: ${activeProvider()}`);
  else if (allowKeyless) ok(`no production-grade key, but ALLOW_KEYLESS_WEB=1 (provider=${activeProvider()} — current events will often REFUSE)`);
  else bad("no production-grade search provider (set GROQ_API_KEY / TAVILY_API_KEY / BRAVE_SEARCH_API_KEY / SERPER_API_KEY, or ALLOW_KEYLESS_WEB=1 to accept keyless)");
}

/* 3) Real current-event search smoke. */
console.log("── 3/4 current-event search smoke ──");
if (process.env.SKIP_LIVE_SEARCH_SMOKE === "1") {
  ok("skipped (SKIP_LIVE_SEARCH_SMOKE=1)");
} else {
  try {
    const r = await webSearchMany(["Who is the current Chief Minister of Tamil Nadu?"], 5);
    const trusted = r.results.filter((x) => (x.tier ?? 5) <= 3);
    if (trusted.length > 0) {
      ok(`current-event search returned ${trusted.length} trusted source(s) via ${r.provider}`);
    } else {
      bad(`current-event search returned no trusted source (provider=${r.provider})`);
    }
  } catch (e) {
    bad(`current-event search threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/* 4) Website fetch capability. */
console.log("── 4/4 website fetch smoke ──");
if (process.env.SKIP_WEB_SMOKE === "1") {
  ok("skipped (SKIP_WEB_SMOKE=1)");
} else {
  try {
    const r = await fetchWebsite("https://example.com");
    if (r.ok && r.text.length > 0) ok(`fetched example.com (${r.text.length} chars extracted)`);
    else bad(`website fetch failed: ${r.ok ? "empty content" : r.reason} (set SKIP_WEB_SMOKE=1 only if egress is blocked in CI)`);
  } catch (e) {
    bad(`website fetch threw: ${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log("");
if (failures.length) {
  console.error(`❌ LIVE-VERIFICATION GATE FAILED (${failures.length}):`);
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}
console.log("✅ LIVE-VERIFICATION GATE PASSED");
