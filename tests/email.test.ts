import { describe, it, expect, vi, afterEach } from "vitest";
import { sendPasswordResetEmail } from "@/lib/email/send";

describe("password reset email adapter", () => {
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  afterEach(() => {
    vi.restoreAllMocks();
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = oldFrom;
  });

  it("does not attempt delivery when Resend is unconfigured", async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await sendPasswordResetEmail("a@example.com", "https://hajihazai.com/reset-password?token=x");
    expect(result).toEqual({ delivered: false, provider: "none" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends through Resend when configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "HajiHaz AI <noreply@example.com>";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "e1" }), { status: 200 }));
    const result = await sendPasswordResetEmail("a@example.com", "https://hajihazai.com/reset-password?token=x");
    expect(result.delivered).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith("https://api.resend.com/emails", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.to).toEqual(["a@example.com"]);
    expect(body.text).toContain("https://hajihazai.com/reset-password?token=x");
  });

  it("fails closed without throwing when Resend rejects", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "HajiHaz AI <noreply@example.com>";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 500 }));
    await expect(sendPasswordResetEmail("a@example.com", "https://example.com/reset")).resolves.toEqual({ delivered: false, provider: "resend" });
  });
});
