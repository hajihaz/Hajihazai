import { describe, expect, it } from "vitest";

describe("test environment safety", () => {
  it.skipIf(process.env.RUN_DB_TESTS === "1")("never loads a production database by default", () => {
    const url = process.env.DATABASE_URL ?? "";
    expect(url).not.toContain("ep-little-glade-ao9fsoew");
  });
});
