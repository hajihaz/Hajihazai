/**
 * Weekly / Monthly Quality Report (observe-and-improve sprint).
 *
 * Weekly (default): the 7 core metrics + quality score for the current week,
 * the auto knowledge backlog, content recommendations, 👎 categorization, and
 * per-brain health — the repeatable weekly review in one command.
 * Monthly (--monthly): adds trends (quality score, satisfaction), knowledge
 * growth, top improvements, and next month's priorities.
 *
 * Read-only. Output: markdown to stdout; pass --out <path> to also write a file.
 * Run: npm run quality:report   |   npm run quality:report:monthly
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
for (const l of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const t = l.trim(); if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("="); if (i < 0) continue;
  const k = t.slice(0, i).trim(); const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!process.env[k]) process.env[k] = v;
}
const { loadRetrievalEvents } = await import("../lib/admin/analytics.ts");
const { computeQualityDashboard } = await import("../lib/admin/quality.ts");
const { computeKnowledgeBacklog, recommendContent, analyzeFeedback } = await import("../lib/admin/insights.ts");
const { getBrainHealth } = await import("../lib/admin/brain-health.ts");
const { neon } = await import("@neondatabase/serverless");

const monthly = process.argv.includes("--monthly");
const outIdx = process.argv.indexOf("--out");
const outPath = outIdx > -1 ? process.argv[outIdx + 1] : null;

const rangeDays = monthly ? 84 : 56; // monthly report looks over 12 weeks of trend
const events = await loadRetrievalEvents(rangeDays, 20_000);
const d = computeQualityDashboard(events, rangeDays);
const backlog = computeKnowledgeBacklog(events);
const recs = recommendContent(events);
const fb = analyzeFeedback(events);
const health = await getBrainHealth(events);

const fmt = (v: number | null, suffix = "") => (v == null ? "—" : `${v}${suffix}`);
const L: string[] = [];
const title = monthly ? "Monthly Quality Report" : "Weekly Quality Report";
L.push(`# ${title} — ${new Date().toISOString().slice(0, 10)}`, "");
L.push(`Range: last ${rangeDays} days · ${d.totalTurns} turns analyzed`, "");

L.push("## Core Metrics (overall)", "");
L.push(`| Metric | Value |`, `|---|---|`);
L.push(`| Quality Score | **${fmt(d.overall.qualityScore, " / 100")}** |`);
L.push(`| Helpful Answer % | ${fmt(d.overall.helpfulPct, "%")} (${d.overall.ratedCount} rated) |`);
L.push(`| Clarification Rate | ${d.overall.clarificationPct}% |`);
L.push(`| Zero-Result Rate | ${d.overall.zeroResultPct}% |`);
L.push(`| Average Latency | ${fmt(d.overall.avgLatencyMs, " ms")} |`);
L.push(`| Most-Used Brains | ${d.mostUsedBrains.map((b) => `${b.brain} (${b.count})`).join(", ") || "—"} |`, "");

L.push("## Weekly Trend", "");
L.push(`| Week of | Turns | Score | Helpful % | Clarify % | Zero % | Latency |`, `|---|---|---|---|---|---|---|`);
for (const w of d.weeks) L.push(`| ${w.weekStart} | ${w.turns} | ${fmt(w.qualityScore)} | ${fmt(w.helpfulPct, "%")} | ${w.clarificationPct}% | ${w.zeroResultPct}% | ${fmt(w.avgLatencyMs, " ms")} |`);
if (!d.weeks.length) L.push("_No data yet._");
L.push("");

L.push("## Top Disliked Queries (👎)", "");
L.push(...(d.topDislikedQueries.length ? d.topDislikedQueries.map((q) => `- ${q}`) : ["_None._"]), "");

L.push("## 👎 Categorization (ranked)", "");
if (fb.ranked.length) {
  L.push(`| Category | Count | Examples |`, `|---|---|---|`);
  for (const r of fb.ranked) L.push(`| ${r.category} | ${r.count} | ${r.examples.slice(0, 3).join("; ")} |`);
} else L.push(`_No 👎 feedback in range (${fb.totalDisliked})._`);
L.push("");

L.push("## Knowledge Backlog (auto — recurring zero-result queries)", "");
if (backlog.length) {
  L.push(`| Query | Freq | Suggested Brain | Suggested Title | Priority |`, `|---|---|---|---|---|`);
  for (const b of backlog) L.push(`| ${b.query} | ${b.frequency} | ${b.suggestedBrain} | ${b.suggestedTitle} | ${b.priority} |`);
} else L.push("_Empty — no query has hit 3+ zero-results._");
L.push("");

L.push("## Top Missing Topics → Document Recommendations (recommend only)", "");
if (recs.length) {
  L.push(`| Topic | Brain | Suggested Title | Why |`, `|---|---|---|---|`);
  for (const r of recs) L.push(`| ${r.topic} | ${r.suggestedBrain} | ${r.suggestedTitle} | ${r.reason} |`);
} else L.push("_Nothing outstanding._");
L.push("");

L.push("## Brain Health", "");
L.push(`| Brain | Docs | Chunks | Embedded | Retrievals | Zero % | Avg docs/turn | Status |`, `|---|---|---|---|---|---|---|---|`);
const badge = (s: string) => (s === "healthy" ? "🟢 Healthy" : s === "warning" ? "🟡 Warning" : "🔴 Needs Review");
for (const b of health) L.push(`| ${b.brain} | ${b.docs} | ${b.chunks} | ${b.embeddedPct}% | ${b.retrievals} | ${b.zeroResultPct}% | ${fmt(b.avgDocsRetrieved)} | ${badge(b.status)} (${b.statusReason}) |`);
L.push("");

if (monthly) {
  // Knowledge growth: documents created per ISO week (DB createdAt).
  const sql = neon(process.env.DATABASE_URL!);
  const growth = await sql`
    SELECT to_char(date_trunc('week', kd."createdAt"), 'YYYY-MM-DD') AS week, count(*)::int AS docs
    FROM knowledge_document kd
    WHERE kd.status = 'active' AND kd."createdAt" > now() - interval '84 days'
    GROUP BY 1 ORDER BY 1`;
  L.push("## Knowledge Growth (docs added per week)", "");
  L.push(...(growth.length ? growth.map((g) => `- Week of ${g.week}: +${g.docs} documents`) : ["_No new documents in range._"]), "");

  const scored = d.weeks.filter((w) => w.qualityScore != null);
  const delta = scored.length >= 2 ? scored[scored.length - 1].qualityScore! - scored[0].qualityScore! : null;
  L.push("## Trends", "");
  L.push(`- Quality score: ${scored.map((w) => `${w.weekStart}=${w.qualityScore}`).join(" → ") || "insufficient data"}${delta != null ? ` (Δ ${delta >= 0 ? "+" : ""}${delta})` : ""}`);
  L.push(`- User satisfaction (helpful %): ${d.weeks.filter((w) => w.helpfulPct != null).map((w) => `${w.weekStart}=${w.helpfulPct}%`).join(" → ") || "insufficient data"}`);
  L.push(`- Brain health: ${health.filter((h) => h.status === "healthy").length}/${health.length} healthy`, "");

  L.push("## Next Month's Priorities", "");
  const prios = [
    ...backlog.slice(0, 3).map((b) => `Create "${b.suggestedTitle}" in ${b.suggestedBrain} (asked ${b.frequency}×, zero results)`),
    ...fb.ranked.slice(0, 2).map((r) => `Address top 👎 category: ${r.category} (${r.count})`),
    ...health.filter((h) => h.status !== "healthy").map((h) => `Review brain "${h.brain}" (${h.statusReason})`),
  ];
  L.push(...(prios.length ? prios.map((p, i) => `${i + 1}. ${p}`) : ["_No outstanding priorities — keep collecting data._"]), "");
}

const report = L.join("\n");
console.log(report);
if (outPath) { writeFileSync(outPath, report); console.error(`\n(written to ${outPath})`); }
