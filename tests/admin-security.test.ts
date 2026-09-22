import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { scryptSync, randomBytes } from "node:crypto";
import { verifyPassword } from "@/lib/auth/password";

/** Fix #1 — admin creation must NOT be possible for the public. */
describe("admin security", () => {
  it("removes the public bootstrap/initialize-admin endpoint", () => {
    expect(existsSync("app/api/admin/bootstrap/route.ts")).toBe(false);
  });

  it("guards every admin API route except login/logout", () => {
    const files = execFileSync("find", ["app/api/admin", "-type", "f", "-name", "route.ts"], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
    for (const f of files) {
      if (f.endsWith("/login/route.ts") || f.endsWith("/logout/route.ts")) continue;
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("requireAdmin");
      expect(src, f).toContain("if (!sess)");
    }
  });

  it("rate-limits every state-changing admin API route", () => {
    const files = execFileSync("find", ["app/api/admin", "-type", "f", "-name", "route.ts"], { encoding: "utf8" })
      .trim().split("\n").filter(Boolean);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (/export async function (POST|PATCH|PUT|DELETE)\b/.test(src)) {
        expect(src, f).toContain("rateLimitResponse");
      }
    }
  });

  it("keeps high-cost admin password reset input bounded", () => {
    const src = readFileSync("app/api/admin/users/[id]/reset-password/route.ts", "utf8");
    expect(src).toContain("validatePassword");
    expect(src).toContain("adminResetUserPassword");
  });

  it("protects the security-audit export and keeps it rate-limited", () => {
    const src = readFileSync("app/api/admin/export/security-audit/route.ts", "utf8");
    expect(src).toContain("requireAdmin");
    expect(src).toContain("rateLimitResponse");
    expect(src).toContain("Cache-Control");
    expect(src).not.toContain("passwordHash");
    expect(src).not.toContain("sessionToken");
  });

  it("marks the entire admin API namespace private and non-cacheable", () => {
    const src = readFileSync("next.config.ts", "utf8");
    expect(src).toContain('source: "/api/admin/:path*"');
    expect(src).toContain('value: "private, no-store, max-age=0, must-revalidate"');
  });

  it("removes the 'initialize first admin' path from the portal UI", () => {
    const ui = readFileSync("components/admin-portal.tsx", "utf8");
    expect(ui).not.toContain("bootstrap");
    expect(ui.toLowerCase()).not.toContain("initialize admin");
  });

  it("ships a trusted seed script for the first admin", () => {
    expect(existsSync("scripts/seed-admin.mjs")).toBe(true);
    expect(readFileSync("package.json", "utf8")).toContain("seed:admin");
  });

  it("a seed-script scrypt hash verifies against the app's verifyPassword", async () => {
    // Must match lib/auth/password.ts format: scrypt:<saltHex>:<keyHex>, keylen 64.
    const salt = randomBytes(16).toString("hex");
    const hash = `scrypt:${salt}:${scryptSync("SeedPass123", salt, 64).toString("hex")}`;
    expect(await verifyPassword("SeedPass123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
