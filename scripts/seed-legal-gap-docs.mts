/**
 * Phase 1 — Legal knowledge gap fix. Four LLB-level documents whose topics route
 * to the legal brain but had NO backing document (confirmed zero/irrelevant
 * retrieval): Tort Law, Negligence, Directive Principles (DPSP), IPC→BNS.
 *
 * DRY RUN by default. Pass --apply to ingest into "legal" (idempotent by title).
 * Run: npx tsx scripts/seed-legal-gap-docs.mts [--apply]
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
interface Doc { title: string; category: string; content: string }

export const LEGAL_GAP_DOCS: Doc[] = [
  {
    title: "Tort Law — Fundamentals",
    category: "tort",
    content: `TORT LAW — FUNDAMENTALS

DEFINITION
A tort is a civil wrong, independent of contract, for which the remedy is an
action for unliquidated damages. The word "tort" derives from the Latin "tortum"
(to twist), meaning conduct that is not straight or lawful. Tort law protects
interests such as bodily safety, reputation, property, and enjoyment of land.

TORT vs CRIME vs CONTRACT
- Tort vs Crime: A tort is a private wrong redressed by the injured party through
  a civil suit for damages; a crime is a public wrong prosecuted by the State and
  punished. The same act (e.g. assault) can be both a tort and a crime.
- Tort vs Contract: Duties in contract are fixed by the parties; duties in tort
  are fixed by law and owed to persons generally. Damages in contract are
  liquidated/agreed; in tort they are unliquidated (assessed by the court).

ESSENTIAL ELEMENTS
1. A wrongful act or omission by the defendant.
2. A legal damage caused to the plaintiff (violation of a legal right).
3. A legal remedy in the form of an action for unliquidated damages.

DAMNUM SINE INJURIA vs INJURIA SINE DAMNO
- Damnum sine injuria: actual loss without violation of a legal right — NOT
  actionable (e.g. loss caused by lawful competition; Gloucester Grammar School).
- Injuria sine damno: violation of a legal right without actual loss — actionable
  per se (e.g. Ashby v White, denial of the right to vote).

GENERAL DEFENCES
- Volenti non fit injuria (consent to the risk).
- Inevitable accident and Act of God (vis major).
- Private defence, necessity, and statutory authority.
- Plaintiff the wrongdoer; mistake (generally no defence).

KINDS OF TORTS
Negligence, nuisance (public/private), defamation (libel/slander), trespass (to
person, land, or goods), false imprisonment, and strict/absolute liability
(Rylands v Fletcher; M.C. Mehta v Union of India).

REMEDIES
Judicial remedies: damages (compensatory, nominal, exemplary), injunction, and
specific restitution of property. Extra-judicial remedies: self-help, re-entry,
abatement of nuisance.`,
  },
  {
    title: "Negligence (Law of Tort)",
    category: "tort",
    content: `NEGLIGENCE (LAW OF TORT)

DEFINITION
Negligence is the breach of a legal duty to take care which results in damage,
undesired by the defendant, to the plaintiff. It is both an independent tort and
a mode of committing certain other torts.

ESSENTIAL ELEMENTS
1. Duty of care — the defendant owed the plaintiff a legal duty to take care.
2. Breach of duty — the defendant failed to meet the standard of the reasonable
   person ("the man on the Clapham omnibus").
3. Causation — the breach caused the damage ("but for" test) and the damage was
   not too remote (foreseeability; Overseas Tankship v Morts Dock, "The Wagon
   Mound").
4. Damage — the plaintiff suffered actual, legally recognised harm.

DUTY OF CARE — THE NEIGHBOUR PRINCIPLE
Donoghue v Stevenson (1932) established the modern duty of care: one must take
reasonable care to avoid acts or omissions which one can reasonably foresee would
be likely to injure one's "neighbour" — persons so closely and directly affected
that one ought to have them in contemplation.

STANDARD OF CARE
The standard is objective: that of a reasonable, prudent person. It rises with
the magnitude of foreseeable risk and the seriousness of potential harm; it is
adjusted for professionals (the Bolam standard for skilled defendants).

RES IPSA LOQUITUR
"The thing speaks for itself." Where the accident is of a kind that ordinarily
does not happen without negligence, the thing was under the defendant's control,
and there is no explanation, negligence is inferred and the burden shifts to the
defendant.

DEFENCES
- Contributory negligence: the plaintiff's own want of care contributed to the
  harm; damages are apportioned.
- Composite negligence: two or more independent wrongdoers cause a single
  indivisible injury; they are jointly and severally liable.
- Volenti non fit injuria; inevitable accident.

MEDICAL NEGLIGENCE
A doctor is negligent if the treatment falls below the standard of a reasonably
competent practitioner of that field (Bolam test, applied in India in Jacob
Mathew v State of Punjab). Mere error of judgment is not negligence.`,
  },
  {
    title: "Directive Principles of State Policy (DPSP)",
    category: "constitution",
    content: `DIRECTIVE PRINCIPLES OF STATE POLICY (DPSP)

OVERVIEW
The Directive Principles of State Policy are contained in Part IV (Articles
36–51) of the Constitution of India. They were borrowed from the Constitution of
Ireland and lay down guidelines that the State must keep in mind while framing
laws and policies, aiming to establish a welfare state and secure social and
economic justice.

NON-JUSTICIABLE NATURE
Article 37 declares that the Directive Principles are NOT enforceable by any
court, but are nevertheless "fundamental in the governance of the country," and
it is the duty of the State to apply them in making laws.

CLASSIFICATION
1. Socialistic principles — Art 38 (welfare of people, reduce inequalities),
   Art 39 (adequate means of livelihood, equal pay for equal work, no
   concentration of wealth), Art 39A (equal justice and free legal aid),
   Art 41 (right to work, education, public assistance), Art 42 (just conditions
   of work and maternity relief), Art 43 (living wage), Art 47 (nutrition and
   public health).
2. Gandhian principles — Art 40 (organisation of village panchayats), Art 43
   (cottage industries), Art 46 (promotion of SCs/STs and weaker sections),
   Art 47 (prohibition of intoxicants), Art 48 (organisation of agriculture and
   animal husbandry; protection of cows).
3. Liberal-intellectual principles — Art 44 (Uniform Civil Code), Art 45 (early
   childhood care and education), Art 48A (protection of environment, forests and
   wildlife), Art 49 (protection of monuments), Art 50 (separation of judiciary
   from executive), Art 51 (promotion of international peace and security).

DPSP vs FUNDAMENTAL RIGHTS
- Champakam Dorairajan (1951): in a conflict, Fundamental Rights prevailed and
  DPSP had to conform to them.
- 42nd Amendment (1976) widened Article 31C to give some DPSP primacy; Minerva
  Mills (1980) struck down the wider version, holding that the balance between
  Fundamental Rights and Directive Principles is part of the basic structure.
- Kesavananda Bharati (1973) confirmed both are complementary, not antagonistic.

SIGNIFICANCE
DPSP act as a yardstick to measure the government's performance, provide
continuity of policy, and have guided major welfare legislation despite being
non-justiciable.`,
  },
  {
    title: "IPC to BNS Transition — Overview",
    category: "criminal",
    content: `IPC TO BNS TRANSITION — OVERVIEW

THE THREE NEW CRIMINAL LAWS
Effective 1 July 2024, India replaced its three colonial-era criminal laws:
- Indian Penal Code, 1860 (IPC)  ->  Bharatiya Nyaya Sanhita, 2023 (BNS)
- Code of Criminal Procedure, 1973 (CrPC)  ->  Bharatiya Nagarik Suraksha
  Sanhita, 2023 (BNSS)
- Indian Evidence Act, 1872  ->  Bharatiya Sakshya Adhiniyam, 2023 (BSA)

BNS — STRUCTURE
The BNS reorganises and consolidates the substantive criminal law. It contains
358 sections (the IPC had 511), grouping offences more logically and removing
obsolete provisions.

KEY CHANGES INTRODUCED BY THE BNS
- New offences defined: organised crime, petty organised crime, terrorism (given
  a statutory definition within the general penal law), and mob lynching (murder
  by a group on grounds such as race, caste, community, sex, or language).
- Snatching is made a distinct offence separate from theft.
- Community service is introduced as a form of punishment for certain minor
  offences for the first time.
- Sedition (old Section 124A IPC) is repealed as such and replaced by Section
  152 BNS, which penalises acts endangering the sovereignty, unity, and integrity
  of India.
- Gender-neutral and victim-centric provisions and time-bound processes are
  emphasised (procedural timelines sit largely in the BNSS).

ILLUSTRATIVE SECTION MAPPING (IPC -> BNS)
- Murder: Section 302 IPC  ->  Section 103 BNS.
- Culpable homicide not amounting to murder: Section 304 IPC -> Section 105 BNS.
- Cheating: Section 420 IPC  ->  Section 318 BNS.
- Rape: Sections 375/376 IPC  ->  Sections 63/64 BNS.
- Criminal breach of trust: Section 406 IPC  ->  Section 316 BNS.
- Defamation: Section 499/500 IPC  ->  Section 356 BNS.

NOTE
Section numbers changed comprehensively; the IPC continues to apply to offences
committed before 1 July 2024, while the BNS applies to offences on or after that
date. Always cite the statute in force on the date of the offence.`,
  },
];

const apply = process.argv.includes("--apply");
const { neon } = await import("@neondatabase/serverless");
const sql = neon(process.env.DATABASE_URL!);
const [brain] = await sql`SELECT id FROM brains WHERE slug='legal'`;
const [owner] = await sql`SELECT "userId" AS uid FROM knowledge_document WHERE status='active' GROUP BY "userId" ORDER BY COUNT(*) DESC LIMIT 1`;
const existing = (await sql`SELECT title FROM knowledge_document WHERE brain_id=${brain.id} AND status='active'`).map((r) => r.title);

console.log(`legal brain: ${brain.id} | ${LEGAL_GAP_DOCS.length} target docs | existing: ${existing.length}\n`);
for (const d of LEGAL_GAP_DOCS) console.log(`  ${existing.includes(d.title) ? "· (exists, skip)" : "+ (new)       "} ${d.title}`);

if (!apply) {
  console.log("\n── FULL CONTENT ──");
  for (const d of LEGAL_GAP_DOCS) console.log(`\n══ ${d.title} ══\n${d.content}`);
  console.log("\nDRY RUN — nothing written. Re-run with --apply to ingest (skips existing titles).");
  process.exit(0);
}

const { ingestText } = await import("../lib/knowledge/ingest.ts");
let ok = 0;
for (const d of LEGAL_GAP_DOCS) {
  if (existing.includes(d.title)) { console.log(`· skip (exists): ${d.title}`); continue; }
  const res = await ingestText(owner.uid, { title: d.title, content: d.content, brainId: brain.id, visibility: "global", category: d.category });
  if ("ok" in res && res.ok) { ok++; console.log(`✅ ${d.title} (${res.chunks} chunks)`); } else console.error(`❌ ${d.title}: ${(res as { error: string }).error}`);
}
console.log(`\nIngested ${ok} new documents.`);
