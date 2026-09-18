import { describe, expect, it, vi } from "vitest";
vi.stubEnv("AUTH_SECRET", "test-secret-for-share");
import { createShareToken, verifyShareToken } from "@/lib/share";
describe("share tokens", () => {
  it("round-trips a conversation id", () => {
    const id = "conversation-123";
    expect(verifyShareToken(createShareToken(id))).toBe(id);
  });
  it("rejects tampering", () => {
    const token = createShareToken("conversation-123");
    expect(verifyShareToken(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"))).toBeNull();
  });
});
