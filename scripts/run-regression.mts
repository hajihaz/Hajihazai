/**
 * Permanent production validation suite (Phase 9). Runs the canonical
 * regression pack (scripts/regression-questions.json) through the LIVE routing +
 * retrieval decision path and grades each question A (correct) or D (wrong).
 *
 * Requires a reachable embedding provider (Ollama) + the production DB. It is a
 * read-only integration check — no chat generation, no writes.
 *
 * Run: npx tsx scripts/run-regression.mts
 * Targets: A >= 95%, D = 0.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}
const { routeToBrain } = await import("../lib/ai/brain-router.ts");
const { detectMultiBrainScope } = await import("../lib/ai/multi-brain.ts");
const { needsResolution, resolveReference } = await import("../lib/ai/reference-resolution.ts");
const { shouldRetrieve } = await import("../lib/ai/should-retrieve.ts");
const { buildKnowledgeContext, buildMemoryContext } = await import("../lib/memory/context.ts");
const { getBrainBySlug } = await import("../lib/db/brain-queries.ts");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL!);
const [owner] = await sql`SELECT "userId" AS uid FROM knowledge_document WHERE status='active' GROUP BY "userId" ORDER BY COUNT(*) DESC LIMIT 1`;

const brainCache: Record<string, unknown> = {};
async function brain(s: string) { return (brainCache[s] ??= await getBrainBySlug(s)); }
const REAL = ["haji-core", "allbee", "suplaykart", "legal"];

interface Q { id: string; cat: string; q: string; exp: string; contains?: string; prior?: string[] }
const Q: Q[] = JSON.parse(readFileSync(resolve(__dirname, "regression-questions.json"), "utf8"));

function outcome(msg: string, prior: string[] = []) {
  let rq = msg;
  if (needsResolution(msg)) rq = resolveReference(msg, prior).resolved;
  const route = routeToBrain(rq);
  const multi = detectMultiBrainScope(rq);
  const isMulti = multi.length >= 2;
  const wr = shouldRetrieve(msg);
  const unrouted = (route?.brain ?? null) === null;
  const clarify = unrouted && !isMulti && wr;
  const label = !wr ? "answer" : isMulti ? "multi" : clarify ? "clarify" : route?.brain ?? "answer";
  return { label, rq };
}
async function retrieves(slug: string, q: string, want: string) {
  const b = await brain(slug) as { id: string } | null;
  const ctx = await buildKnowledgeContext(owner.uid, { query: q, projectId: null, brainId: b?.id });
  return ctx.chunks.map((c) => c.content).join(" ").toLowerCase().includes(want.toLowerCase());
}
async function memoryHas(q: string, want: string) {
  const m = await buildMemoryContext(owner.uid, { query: q });
  const b = await brain("haji-core") as { id: string } | null;
  const k = await buildKnowledgeContext(owner.uid, { query: q, projectId: null, brainId: b?.id });
  const blob = (m.memories.map((x) => x.content).join(" ") + " " + k.chunks.map((c) => c.content).join(" ")).toLowerCase();
  return blob.includes(want.toLowerCase());
}

let A = 0, C = 0, D = 0;
const fails: string[] = [];
for (const t of Q) {
  const o = outcome(t.q, t.prior ?? []);
  const expSet = t.exp.split("|");
  const realBrain = expSet.find((x) => REAL.includes(x));
  let grade = "A", note = "";
  if (t.exp === "multi") grade = o.label === "multi" ? "A" : "D";
  else if (t.exp === "clarify") grade = o.label === "clarify" ? "A" : o.label === "answer" ? "C" : "D";
  else if (t.exp === "memory") { const ok = await memoryHas(t.q, t.contains!); grade = ok ? "A" : "D"; if (!ok) note = "memory term missing"; }
  else {
    const routeOk = expSet.includes(o.label);
    if (!routeOk) { if (expSet.includes("clarify") && o.label === "clarify") grade = "A"; else { grade = "D"; note = `routed ${o.label}`; } }
    else if (o.label === "clarify") grade = "A";
    else if (t.contains) { const useBrain = o.label === "multi" && realBrain ? realBrain : o.label; const ok = await retrieves(useBrain, o.rq, t.contains); grade = ok ? "A" : "D"; if (!ok) note = `missing "${t.contains}"`; }
  }
  if (grade === "A") A++; else if (grade === "C") C++; else { D++; fails.push(`${t.id} [${t.cat}] "${t.q}" → ${note}`); }
}
const aPct = (100 * A) / Q.length;
console.log(`GRADES: A=${A} C=${C} D=${D} (of ${Q.length}); A%=${aPct.toFixed(1)} — gates: A>=95%, D=0`);
if (fails.length) { console.log("FAILURES:"); for (const f of fails) console.log("  " + f); }
// Deployment gate (Phase 7): block when A-grade < 95% OR any D-grade exists.
if (D > 0 || aPct < 95) {
  console.error(`\n❌ DEPLOYMENT GATE FAILED — ${D > 0 ? `${D} D-grade(s)` : ""}${D > 0 && aPct < 95 ? " and " : ""}${aPct < 95 ? `A=${aPct.toFixed(1)}% < 95%` : ""}. Do not deploy.`);
  process.exit(1);
}
console.log("✅ DEPLOYMENT GATE PASSED (A>=95%, D=0).");
