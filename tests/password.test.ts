import fs from "node:fs";
import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
  validatePassword,
} from "@/lib/auth/password";

describe("password hashing + tokens", () => {
  it("hashes and verifies a password", async () => {
    const h = await hashPassword("Sup3rSecret!");
    expect(h.startsWith("scrypt:")).toBe(true);
    expect(await verifyPassword("Sup3rSecret!", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("uses a unique salt per hash", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("verify rejects null / malformed stored hashes", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
    expect(await verifyPassword("x", "scrypt:onlytwo")).toBe(false);
  });

  it("reset token: raw differs from stored hash; hash is stable", () => {
    const { token, tokenHash } = generateToken();
    expect(token).not.toBe(tokenHash);
    expect(hashToken(token)).toBe(tokenHash);
    expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("validatePassword enforces minimum length", () => {
    expect(validatePassword("short").ok).toBe(false);
    expect(validatePassword("longenough").ok).toBe(true);
    expect(validatePassword(123).ok).toBe(false);
  });
});

describe("knowledge text extraction", () => {
  it("reads TXT and MD natively", async () => {
    const { extractText } = await import("@/lib/knowledge/extract");
    expect((await extractText("txt", Buffer.from("hello"))).ok).toBe(true);
    const md = await extractText("md", Buffer.from("# hi"));
    expect(md.ok && md.text).toBe("# hi");
  });

  it("extracts text from PDF and DOCX", async () => {
    const { extractText, extFromName, isSupportedExt } = await import(
      "@/lib/knowledge/extract"
    );
    const pdf = await extractText(
      "pdf",
      fs.readFileSync("tests/fixtures/knowledge-fixture.pdf"),
    );
    expect(pdf.ok && pdf.text).toContain("HajiHaz PDF fixture");

    const docx = await extractText(
      "docx",
      fs.readFileSync("tests/fixtures/knowledge-fixture.docx"),
    );
    expect(docx.ok && docx.text).toContain("Walking on imported air");

    expect((await extractText("exe", Buffer.from("x"))).ok).toBe(false);
    expect(extFromName("a.b.TXT")).toBe("txt");
    expect(isSupportedExt("pdf")).toBe(true);
    expect(isSupportedExt("docx")).toBe(true);
    expect(isSupportedExt("exe")).toBe(false);
  });

  it("returns a safe error for malformed PDF/DOCX input", async () => {
    const { extractText } = await import("@/lib/knowledge/extract");
    expect((await extractText("pdf", Buffer.from("not-a-pdf"))).ok).toBe(false);
    expect((await extractText("docx", Buffer.from("not-a-docx"))).ok).toBe(false);
  });

  it("rejects excessively large extracted text", async () => {
    const { extractText, MAX_EXTRACTED_CHARS } = await import("@/lib/knowledge/extract");
    const result = await extractText("txt", Buffer.alloc(MAX_EXTRACTED_CHARS + 1, "a"));
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("too much extracted text");
  });
});
