import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGuestTransferToken, verifyGuestTransferToken } from "@/lib/auth/guest-transfer";

describe("guest transfer token", () => {
  const previous = process.env.AUTH_SECRET;
  beforeEach(() => { process.env.AUTH_SECRET = "guest-transfer-test-secret-with-enough-entropy"; });
  afterEach(() => { if (previous === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = previous; });

  it("round-trips a signed guest id", () => {
    const token = createGuestTransferToken("guest-user-1");
    expect(verifyGuestTransferToken(token)).toBe("guest-user-1");
  });

  it("rejects tampered tokens", () => {
    const token = createGuestTransferToken("guest-user-1");
    expect(verifyGuestTransferToken(`${token}x`)).toBeNull();
  });
});
