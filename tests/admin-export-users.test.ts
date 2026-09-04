import { describe, it, expect, vi } from "vitest";

type ExportRow = {
  id: string;
  email: string;
  username: string | null;
  googleName: string | null;
  isDisabled: boolean;
  isTerminated: boolean;
  isSuspended: boolean;
  createdAt: Date;
  lastLogin: Date | null;
  hasGoogle: boolean;
  hasPassword: boolean;
};

function makeRows(count: number): ExportRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `user-${i}`,
    email: `user-${i}@example.com`,
    username: `user${i}`,
    googleName: null,
    isDisabled: false,
    isTerminated: false,
    isSuspended: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    lastLogin: null,
    hasGoogle: false,
    hasPassword: true,
  }));
}

async function runExport(rows: ExportRow[], total: number, truncated: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/admin/session", () => ({ requireAdmin: async () => ({ adminId: "admin" }) }));
  vi.doMock("@/lib/ratelimit", () => ({ rateLimitResponse: vi.fn().mockResolvedValue(null) }));
  vi.doMock("@/lib/admin/queries", () => ({ adminExportUsers: vi.fn().mockResolvedValue({ rows, total, truncated }) }));
  const { GET } = await import("@/app/api/admin/export/users/route");
  return GET();
}

describe("admin user export semantics", () => {
  it("reports a complete export below the limit", async () => {
    const response = await runExport(makeRows(9_999), 9_999, false);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Export-Count")).toBe("9999");
    expect(response.headers.get("X-Export-Total")).toBe("9999");
    expect(response.headers.get("X-Export-Truncated")).toBe("false");
    expect((await response.text()).split("\n")).toHaveLength(10_000);
  });

  it("reports a complete export exactly at the limit", async () => {
    const response = await runExport(makeRows(10_000), 10_000, false);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Export-Count")).toBe("10000");
    expect(response.headers.get("X-Export-Total")).toBe("10000");
    expect(response.headers.get("X-Export-Truncated")).toBe("false");
  });

  it("explicitly reports an export truncated above the limit", async () => {
    const response = await runExport(makeRows(10_000), 10_001, true);
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Export-Count")).toBe("10000");
    expect(response.headers.get("X-Export-Total")).toBe("10001");
    expect(response.headers.get("X-Export-Truncated")).toBe("true");
    expect((await response.text()).split("\n")).toHaveLength(10_001);
  });
});
