import { describe, it, expect, vi } from "vitest";
import { hhcCustomerEnabled, startPairing, authenticateDevice, queueOwnerCommand } from "@/lib/hhc/customer-bridge";

describe("customer HHC launch gate", () => {
  it("fails closed without explicit private-pilot enablement", async () => {
    vi.stubEnv("HHJZ_CUSTOMER_HHC_ENABLED", "0");
    expect(hhcCustomerEnabled()).toBe(false);
    await expect(startPairing("any-id")).rejects.toThrow(/pilot/i);
    await expect(queueOwnerCommand("any-id", { tool:"system_info",args:{} })).rejects.toThrow(/pilot/i);
    await expect(authenticateDevice("other-device", "Bearer any-token")).resolves.toBeNull();
    vi.unstubAllEnvs();
  });
  it("requires exact opt-in value", () => {
    vi.stubEnv("HHJZ_CUSTOMER_HHC_ENABLED", "true");
    expect(hhcCustomerEnabled()).toBe(false);
    vi.stubEnv("HHJZ_CUSTOMER_HHC_ENABLED", "1");
    expect(hhcCustomerEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
});
