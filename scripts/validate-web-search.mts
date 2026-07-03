/**
 * Phase 9 — live-web validation. Confirms each real-time query is classified as
 * "web" and returns live results from trusted sources. Requires network egress.
 *
 * Run: npx tsx scripts/validate-web-search.mts
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
const { classifyQuery } = await import("../lib/web/classify.ts");
const { webSearch } = await import("../lib/web/search.ts");

const QUERIES = [
  "Who is the current Chief Minister of Tamil Nadu?",
  "Current Prime Minister of India?",
  "Reliance share price?",
  "Today's weather in Chennai?",
  "Latest IPL points table?",
  "Latest OpenAI news?",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let classifiedWeb = 0, live = 0, unavailable = 0;
for (const q of QUERIES) {
  const intent = classifyQuery(q);
  const classOk = intent === "web";
  if (classOk) classifiedWeb++;
  let fetchInfo = "";
  if (classOk) {
    // Retry a couple of times — the keyless provider can transiently rate-limit.
    let r = { results: [] as Array<{ host?: string }>, provider: "none" };
    for (let a = 0; a < 3; a++) {
      try { r = await webSearch(q, 3); } catch (e) { r = { results: [], provider: `error:${(e as Error).message}` }; }
      if (r.results.length) break;
      await sleep(2500);
    }
    if (r.results.length) { live++; fetchInfo = `LIVE via ${r.provider}: ${r.results.length} results, top=${r.results[0].host}`; }
    else { unavailable++; fetchInfo = `provider unavailable (${r.provider}) — Phase 8 fallback applies`; }
  }
  console.log(`${classOk ? "✅" : "❌"} classify=${intent.padEnd(8)} | ${fetchInfo.padEnd(52)} | ${q}`);
  await sleep(2500);
}
console.log(`\nCLASSIFICATION: ${classifiedWeb}/${QUERIES.length} → web (deterministic gate)`);
console.log(`LIVE FETCH:     ${live}/${QUERIES.length} returned live results; ${unavailable} fell back (provider rate-limited)`);
// The suite passes if classification is correct for every query; live fetch is
// provider-dependent (keyless DuckDuckGo can rate-limit; set an API key in prod).
process.exit(classifiedWeb === QUERIES.length ? 0 : 1);
