const base = (process.env.PRODUCTION_BASE_URL || "https://hajihazai.vercel.app").replace(/\/$/, "");

const requiredHeaders = {
  "strict-transport-security": /max-age=31536000/i,
  "x-frame-options": /^DENY$/i,
  "x-content-type-options": /^nosniff$/i,
  "referrer-policy": /^strict-origin-when-cross-origin$/i,
  "permissions-policy": /camera=\(\), microphone=\(\), geolocation=\(\)/i,
};

const checks = [
  { name: "homepage", path: "/", method: "GET", expected: 200 },
  { name: "projects auth", path: "/api/projects", method: "GET", expected: 401 },
  { name: "memories auth", path: "/api/memories", method: "GET", expected: 401 },
  { name: "artifacts auth", path: "/api/artifacts", method: "GET", expected: 401 },
  { name: "automations auth", path: "/api/automations", method: "GET", expected: 401 },
  { name: "image generation auth", path: "/api/images/generate", method: "POST", expected: 401 },
  { name: "chat image auth", path: "/api/chat/image", method: "POST", expected: 401 },
  { name: "automation cron protection", path: "/api/cron/automations", method: "GET", expected: 401 },
  { name: "db maintenance cron protection", path: "/api/cron/db-maintenance", method: "GET", expected: 401 },
  { name: "account deletion auth", path: "/api/account/delete", method: "DELETE", expected: 401 },
];

let failures = 0;

async function request(check) {
  const res = await fetch(base + check.path, {
    method: check.method,
    headers: check.method === "POST" ? { "content-type": "application/json" } : undefined,
    body: check.method === "POST" ? "{}" : undefined,
    redirect: "manual",
  });
  if (res.status !== check.expected) {
    failures++;
    console.error("FAIL " + check.name + ": expected " + check.expected + ", got " + res.status);
  } else {
    console.log("PASS " + check.name + ": " + res.status);
  }
  return res;
}

const homepage = await request(checks[0]);
for (const check of checks.slice(1)) await request(check);

for (const [name, pattern] of Object.entries(requiredHeaders)) {
  const value = homepage.headers.get(name) || "";
  if (!pattern.test(value)) {
    failures++;
    console.error("FAIL header " + name + ": " + (value || "<missing>"));
  } else {
    console.log("PASS header " + name);
  }
}

if (failures) {
  console.error("Production smoke failed: " + failures + " check(s).");
  process.exit(1);
}
console.log("Production smoke passed for " + base + ".");
