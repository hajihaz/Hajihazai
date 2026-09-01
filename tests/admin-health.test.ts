import { describe, it, expect, vi, afterEach } from "vitest";

describe("admin health provider checks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("treats authentication failures as unhealthy", async () => {
    vi.resetModules();
    vi.doMock("@/lib/admin/session", () => ({ requireAdmin: async () => ({ userId: "admin" }) }));
    vi.doMock("@/lib/db", () => ({ db: { execute: vi.fn().mockResolvedValue({}) } }));
    const fetchMock = vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env.GROQ_API_KEY = "test";
    const { GET } = await import("@/app/api/admin/health/route");
    const response = await GET();
    const data = await response.json();
    const groq = data.providers.find((p: { provider: string }) => p.provider === "Groq");
    expect(groq.ok).toBe(false);
    expect(groq.status).toBe(401);
    delete process.env.GROQ_API_KEY;
  });

  it("reports a successful provider check as healthy", async () => {
    vi.resetModules();
    vi.doMock("@/lib/admin/session", () => ({ requireAdmin: async () => ({ userId: "admin" }) }));
    vi.doMock("@/lib/db", () => ({ db: { execute: vi.fn().mockResolvedValue({}) } }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    process.env.GROQ_API_KEY = "test";
    const { GET } = await import("@/app/api/admin/health/route");
    const data = await (await GET()).json();
    expect(data.providers.find((p: { provider: string }) => p.provider === "Groq").ok).toBe(true);
    delete process.env.GROQ_API_KEY;
  });
});
