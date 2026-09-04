import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/app/api/cron/db-maintenance/route";

describe("database maintenance cron authorization", () => {
  it("requires an exact bearer secret", () => {
    const ok = new Request("https://example.com/api/cron/db-maintenance", {
      headers: { authorization: "Bearer test-secret" },
    });
    const wrong = new Request("https://example.com/api/cron/db-maintenance", {
      headers: { authorization: "Bearer wrong" },
    });
    expect(isCronAuthorized(ok, "test-secret")).toBe(true);
    expect(isCronAuthorized(wrong, "test-secret")).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    const req = new Request("https://example.com/api/cron/db-maintenance", {
      headers: { authorization: "Bearer test-secret" },
    });
    expect(isCronAuthorized(req, undefined)).toBe(false);
  });
});
