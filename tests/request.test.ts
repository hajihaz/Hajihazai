import { describe, expect, it } from "vitest";
import { rejectOversizedBody } from "@/lib/auth/request";

describe("request body guard", () => {
  it("accepts a body within the configured limit", () => {
    expect(rejectOversizedBody(new Request("http://localhost", { headers: { "content-length": "100" } }), 100)).toBeNull();
  });

  it("rejects an oversized body before JSON parsing", async () => {
    const response = rejectOversizedBody(new Request("http://localhost", { headers: { "content-length": "101" } }), 100);
    expect(response?.status).toBe(413);
  });

  it("rejects an invalid content length", () => {
    expect(rejectOversizedBody(new Request("http://localhost", { headers: { "content-length": "nope" } }), 100)?.status).toBe(400);
    expect(rejectOversizedBody(new Request("http://localhost", { headers: { "content-length": "-1" } }), 100)?.status).toBe(400);
  });

  it("allows requests without a content-length header", () => {
    expect(rejectOversizedBody(new Request("http://localhost"), 100)).toBeNull();
  });
});
