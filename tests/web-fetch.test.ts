/**
 * Website fetch + extraction (Rule #3) — SSRF guard, HTML→text, failure mapping.
 * global.fetch is mocked; no real network.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { normalizeUrl, htmlToText, fetchWebsite } from "@/lib/web/fetch-url";

afterEach(() => vi.restoreAllMocks());

describe("normalizeUrl — SSRF guard", () => {
  it("accepts public http(s) hosts and upgrades bare domains", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com/");
    expect(normalizeUrl("https://example.com/x")).toBe("https://example.com/x");
  });
  it("rejects private / loopback / link-local / metadata hosts", () => {
    for (const h of [
      "http://localhost",
      "http://127.0.0.1",
      "http://10.0.0.5",
      "http://192.168.1.1",
      "http://172.16.0.1",
      "http://172.31.255.255",
      "http://169.254.169.254", // cloud metadata
      "http://[::1]",
      "http://foo.internal",
      "http://bar.local",
    ]) {
      expect(normalizeUrl(h)).toBeNull();
    }
  });
  it("rejects non-http(s) schemes and junk", () => {
    expect(normalizeUrl("ftp://example.com")).toBeNull();
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});

describe("htmlToText", () => {
  it("extracts title and body text, dropping script/style", () => {
    const html =
      "<html><head><title>Acme Co</title><style>.x{color:red}</style></head>" +
      "<body><h1>Welcome</h1><script>evil()</script><p>We build widgets.</p></body></html>";
    const { title, text } = htmlToText(html);
    expect(title).toBe("Acme Co");
    expect(text).toContain("Welcome");
    expect(text).toContain("We build widgets.");
    expect(text).not.toContain("evil");
    expect(text).not.toContain("color:red");
  });
});

function mockFetch(res: Partial<Response> & { text?: () => Promise<string> }) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok: true,
    status: 200,
    url: "https://example.com/",
    headers: new Headers({ "content-type": "text/html" }),
    text: async () => "",
    ...res,
  } as Response);
}

describe("fetchWebsite", () => {
  it("returns extracted content on a good HTML response", async () => {
    mockFetch({
      text: async () =>
        "<title>Acme</title><body><h1>Acme Corporation</h1>" +
        "<p>We build durable widgets and logistics software for retailers across India.</p></body>",
    });
    const r = await fetchWebsite("example.com");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.title).toBe("Acme");
      expect(r.text).toContain("widgets and logistics software");
      expect(r.finalUrl).toBe("https://example.com/");
    }
  });

  it("refuses a blocked host WITHOUT calling fetch", async () => {
    const spy = mockFetch({});
    const r = await fetchWebsite("http://169.254.169.254/latest/meta-data");
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses non-2xx responses", async () => {
    mockFetch({ ok: false, status: 404, text: async () => "nope" });
    const r = await fetchWebsite("example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("404");
  });

  it("refuses non-HTML content types", async () => {
    mockFetch({ headers: new Headers({ "content-type": "application/pdf" }), text: async () => "%PDF" });
    const r = await fetchWebsite("example.com/doc.pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("not readable");
  });

  it("refuses a redirect that lands on an internal host", async () => {
    mockFetch({ url: "http://127.0.0.1/", text: async () => "<body>secret internal page content here</body>" });
    const r = await fetchWebsite("example.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("non-public");
  });

  it("refuses (never throws) when fetch rejects", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    const r = await fetchWebsite("example.com");
    expect(r.ok).toBe(false);
  });

  it("refuses a page with no readable text", async () => {
    mockFetch({ text: async () => "<body><script>var a=1</script></body>" });
    const r = await fetchWebsite("example.com");
    expect(r.ok).toBe(false);
  });
});
