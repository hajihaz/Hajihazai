/**
 * Phase 2 — Knowledge cleanup (dedup + placeholder merge). REVERSIBLE and
 * NON-DESTRUCTIVE: deduped/placeholder docs are re-parented to the (empty,
 * unrouted) "shared" brain rather than deleted — this removes them from active
 * retrieval while preserving the rows, and is trivially undone by moving them
 * back. All real facts also live in a kept or new active document.
 * (The two explicitly-named stubs "Founder"/"College" were removed separately.)
 *
 * Haji Core:
 *   - archive stubs "Founder", "College" (one-line fragments already in richer docs)
 *   - archive monolith "Haji Core Profile V1.0" (duplicates the granular section
 *     docs) AFTER moving its UNIQUE non-sectioned content into a new consolidation
 *     doc. The granular docs (Identity, Education, Family Tree, Friends, Goals &
 *     Personality) remain and cover the sectioned facts.
 * Suplaykart:
 *   - merge 8 overlapping / placeholder docs into ONE real "Operations & Roadmap"
 *     doc; keep Company Overview, Product Categories, Haji Businesses.
 *
 * NO facts are dropped: every real fact is preserved in a kept or new document.
 * DRY RUN by default. Pass --apply. Run: npx tsx scripts/cleanup-knowledge.mts [--apply]
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

const NEW_DOCS: Array<{ brain: string; title: string; category: string; content: string }> = [
  {
    brain: "haji-core", title: "Haji — Skills, Preferences & Profile", category: "Personal",
    content: `HAJI — SKILLS, PREFERENCES & PROFILE

BUSINESSES (SUMMARY)
- Suplaykart: Founder & CEO. Hyperlocal commerce platform for Nagore (founded 01 January 2025; temporarily closed 01 June 2026; planned reopening 01 January 2027).
- AllBee Solutions: Co-Founder & CFO (30% ownership). Digital solutions and technology services company (founded 2025).
- RKN Associates: Director of Strategy and Finance. Construction and interior solutions company founded by his father, Syed Mohamed Hussain Sahib.

INVESTMENT PROFILE
Category: Investor and Trader.
Interest Areas: Stock Market, Long-Term Investing, Business Growth, Entrepreneurship.

TECHNICAL SKILLS
WordPress, HTML, CSS, React Fundamentals, Website Management, Hosting Management, Domain Management, GitHub Workflows, Vercel Deployments, Business Systems Design, Process Automation.

BUSINESS SKILLS
Business Strategy, Financial Planning, Startup Operations, Digital Marketing, Team Coordination, Negotiation, Problem Solving, Business Development.

PERSONAL PREFERENCES
Favorite Color: White.
Favorite Sunglass Brands: Ray-Ban, David Beckham Eyewear.
Favorite Clothing Brand: Andamen.
Favorite Smartphone: iPhone.
Favorite Car: Lexus.
Favorite Foods: Biryani, Fried Rice.

HOBBIES
Walking, Football, Cricket, PUBG, Building Businesses, Thinking About Systems, Entrepreneurship.

MENTORS
Primary Mentor: Allah.
Secondary Mentor: Self-Learning and Personal Experience.

IMPORTANT FACTS
Haji prefers direct and practical answers. He values long-term thinking, focuses heavily on business growth, and is passionate about law and entrepreneurship. He is currently focused on personal growth and building his future — actively developing businesses, legal knowledge and technology systems. His identity is strongly connected to Nagore, entrepreneurship, law and community development.`,
  },
  {
    brain: "suplaykart", title: "Suplaykart — Operations & Roadmap", category: "operations",
    content: `SUPLAYKART — OPERATIONS & ROADMAP

BUSINESS MODEL
Suplaykart is a hyperlocal commerce platform for Nagore and nearby areas,
modelled on a combination of Blinkit, Zepto and Zomato — a single-town
marketplace spanning fast grocery/FMCG delivery and restaurant delivery.

LEADERSHIP
Founder & CEO: Syed Hasan Kuddos Sahib (Haji) — an entrepreneur, law student and
investor from Nagore who founded Suplaykart and co-founded AllBee Solutions.

PRODUCT CATEGORIES
FMCG, Groceries, Bakery, Restaurant Delivery, Medicines, Daily Essentials.

STATUS & ROADMAP
Temporarily closed from 01 June 2026, with a planned relaunch on 01 January 2027.
Founder's one-year goal: successfully relaunch and stabilise Suplaykart.
Longer-term vision: become the most trusted local commerce platform in Tamil Nadu.

NOT YET RECORDED
The detailed revenue model, commission rates, vendor onboarding process, delivery
service-level targets, and customer policies are not yet recorded and are left for
a future update rather than guessed.`,
  },
];

const ARCHIVE: Record<string, string[]> = {
  "haji-core": ["Haji Core Profile V1.0"],
  suplaykart: [
    "Suplaykart — Business Vision",
    "Suplaykart — Founder & Leadership",
    "Suplaykart — Delivery Operations",
    "Suplaykart — Marketplace Structure",
    "Suplaykart — Expansion Plans",
    "Suplaykart — Revenue Model",
    "Suplaykart — Customer Policies",
    "Suplaykart — Vendor Onboarding",
  ],
};

const apply = process.argv.includes("--apply");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL!);

async function counts(label: string) {
  const rows = await sql`SELECT b.slug, count(kd.id)::int docs FROM brains b LEFT JOIN knowledge_document kd ON kd.brain_id=b.id AND kd.status='active' GROUP BY b.slug ORDER BY b.slug`;
  console.log(`\n── ${label} (active docs) ──`);
  for (const r of rows) console.log(`  ${r.slug.padEnd(11)} ${r.docs}`);
}

await counts("BEFORE");
const [owner] = await sql`SELECT "userId" AS uid FROM knowledge_document WHERE status='active' GROUP BY "userId" ORDER BY COUNT(*) DESC LIMIT 1`;

console.log("\nPLAN:");
for (const d of NEW_DOCS) console.log(`  + new [${d.brain}] ${d.title}`);
for (const [brain, titles] of Object.entries(ARCHIVE)) for (const t of titles) console.log(`  - archive [${brain}] ${t}`);

if (!apply) { console.log("\nDRY RUN — nothing changed. Re-run with --apply."); process.exit(0); }

// 1) create new consolidation docs
const { ingestText } = await import("../lib/knowledge/ingest.ts");
for (const d of NEW_DOCS) {
  const [b] = await sql`SELECT id FROM brains WHERE slug=${d.brain}`;
  const [ex] = await sql`SELECT id FROM knowledge_document WHERE brain_id=${b.id} AND title=${d.title} AND status='active'`;
  if (ex) { console.log(`· new doc exists, skip: ${d.title}`); continue; }
  const res = await ingestText(owner.uid, { title: d.title, content: d.content, brainId: b.id, visibility: "global", category: d.category });
  console.log("ok" in res && res.ok ? `✅ created ${d.title} (${res.chunks} chunks)` : `❌ ${d.title}`);
}

// 2) archive deduped/placeholder docs by re-parenting them to the "shared" brain
// (reversible; removes them from active-brain retrieval without deleting).
const [shared] = await sql`SELECT id FROM brains WHERE slug='shared'`;
if (!shared) { console.error("no 'shared' brain — aborting archive step"); process.exit(1); }
let archived = 0;
for (const [brain, titles] of Object.entries(ARCHIVE)) {
  const [b] = await sql`SELECT id FROM brains WHERE slug=${brain}`;
  for (const t of titles) {
    const r = await sql`UPDATE knowledge_document SET brain_id=${shared.id}, "updatedAt"=now() WHERE brain_id=${b.id} AND title=${t} AND status='active' RETURNING id`;
    if (r.length) { archived++; console.log(`🗄️  archived→shared [${brain}] ${t}`); }
    else console.log(`·  not found: [${brain}] ${t}`);
  }
}
console.log(`\nArchived ${archived} documents to the shared brain (reversible).`);
await counts("AFTER");
