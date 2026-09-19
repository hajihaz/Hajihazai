import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = postgres(url);

const brains = [
  ["Haji Core", "haji-core", "Personal identity, family, education, goals, friends, hobbies, preferences, life story."],
  ["Suplaykart Brain", "suplaykart", "Business operations, vendors, delivery model, finances, growth plans, roadmap, marketing."],
  ["AllBee Brain", "allbee", "Clients, projects, services, pricing, digital marketing, development operations."],
  ["Legal Brain", "legal", "LLB notes, constitutional law, company law, case law, legal studies, exam preparation."]
];

for (const [name, slug, description] of brains) {
  await sql.unsafe(
    "insert into brains (id,name,slug,description,icon,color,is_system,\"created_at\",\"updated_at\") values (gen_random_uuid(),$1,$2,$3,'brain','#6366f1',true,now(),now()) on conflict (slug) do nothing",
    [name, slug, description]
  );
}

const brainRows = await sql.unsafe("select id from brains where slug='haji-core'");
if (!brainRows[0]) throw new Error("haji-core brain was not seeded");
const brainId = brainRows[0].id;

const hajiId = "385b652a-e30f-4a22-b26b-415840e4ec11";
await sql.unsafe('delete from "user" where id=$1', [hajiId]);
await sql.unsafe(
  'insert into "user" (id,email) values ($1,$2)',
  [hajiId, "haji-disposable-fixture@example.com"]
);

const docs = [
  ["Haji Identity", "Syed Hasan Kuddos Sahib is Haji. He was born on 29 March 2004 and is from Nagore."],
  ["Haji Education", "Haji studies at SRM School of Law and is pursuing LLB. He previously completed BBA Financial Services."],
  ["Haji Businesses", "Haji runs Suplaykart and is a co-founder/CFO of AllBee Solutions."],
  ["Haji Friends", "Haji's close friend is Azees."],
  ["Haji Goals", "Haji's career goal is to become a Corporate Lawyer while building successful businesses."],
  ["Haji Family", "Haji's family includes his mother Shehnaaz Nisha, sister Hidhayaa, father Syed Mohamed Hussain Sahib, and maternal aunt Safina Thangam. Safina Thangam is Haji's mother's sister. Hamza and Sahabuddin are Safina's sons and Haji's cousins. Haji has a close family bond with them." ]
];

for (const [title, content] of docs) {
  const rows = await sql.unsafe(
    'insert into knowledge_document (id,"userId",title,brain_id,"sourceType",status,visibility,"createdAt","updatedAt") values (gen_random_uuid(),$1,$2,$3,$4,$5,$6,now(),now()) returning id',
    [hajiId, title, brainId, "note", "active", "private"]
  );
  await sql.unsafe(
    'insert into knowledge_chunk (id,"documentId","chunkIndex",content,"createdAt") values (gen_random_uuid(),$1,0,$2,now())',
    [rows[0].id, content]
  );
}

console.log("Disposable DB seed complete.");
await sql.end();
