import { describe, expect, it, vi } from "vitest";
import { createApp, rateKey, TOO_MANY, UPSTREAM_DOWN, type Env } from "./app";
import { UpstreamError, type UkcpClient } from "./ukcp/client";

const RESULTS = `<span class="results-no">1-1 of 1 results</span>
<div class="profile-listing"><a href="therapist/Jo-Bloggs-ABCDEFGH"><h2>Jo Bloggs</h2></a></div>`;

function setup({ allow = true, client = {} as Partial<UkcpClient> } = {}) {
  const limit = vi.fn(async () => ({ success: allow }));
  const env: Env = { UPSTREAM_LIMIT: { limit }, SITE_URL: "https://example.test" };
  const stub = { search: vi.fn(async () => RESULTS), profile: vi.fn(), contact: vi.fn(), ...client } as unknown as UkcpClient;
  const app = createApp(() => stub);
  const request = (path: string, init?: RequestInit) =>
    app.request(path, { ...init, headers: { "cf-connecting-ip": "203.0.113.9", ...init?.headers } }, env);
  return { request, stub, limit };
}

describe("GET /api/search", () => {
  it("returns UKCP's results as plain text that the edge may cache for 15 minutes", async () => {
    const { request, stub, limit } = setup();
    const res = await request("/api/search?Location=Leeds");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=900");
    expect([res.headers.get("Content-Type"), res.headers.get("X-Content-Type-Options")]).toEqual(["text/plain; charset=utf-8", "nosniff"]);
    expect(await res.text()).toBe(RESULTS);
    expect(stub.search).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.9" });
  });

  it("redirects an equivalent query to its canonical form without calling UKCP", async () => {
    const { request, stub } = setup();
    const res = await request("/api/search?Languages=Spanish&Languages=French&Distance=10&page=1");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe("/api/search?Languages=French&Languages=Spanish");
    expect(stub.search).not.toHaveBeenCalled();
  });

  it("answers a canonical query however its characters are percent-encoded", async () => {
    const { request } = setup();
    expect((await request("/api/search?KeywordFilter=a~b")).status).toBe(200);
    expect((await request("/api/search?KeywordFilter=a%7Eb")).status).toBe(200);
  });

  it("rejects values UKCP's form does not offer", async () => {
    const { request, stub } = setup();
    const res = await request("/api/search?Languages=Klingon");
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ param: "Languages" });
    expect(stub.search).not.toHaveBeenCalled();
  });

  it("answers 429 without calling UKCP once the visitor is over the limit", async () => {
    const { request, stub } = setup({ allow: false });
    const res = await request("/api/search?Location=Leeds");
    expect([res.status, (await res.json()).error]).toEqual([429, TOO_MANY]);
    expect(stub.search).not.toHaveBeenCalled();
  });

  it("answers 502, uncached, when UKCP sends a page that isn't search results", async () => {
    const { request } = setup({ client: { search: vi.fn(async () => "<p>Down for maintenance</p>") } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request("/api/search?Location=Leeds");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([502, "no-store"]);
  });

  it("answers 502, uncached, when UKCP fails", async () => {
    const { request } = setup({ client: { search: vi.fn(async () => Promise.reject(new UpstreamError(503, "UKCP answered 503"))) } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request("/api/search?Location=Leeds");
    expect([res.status, res.headers.get("Cache-Control"), (await res.json()).error]).toEqual([502, "no-store", UPSTREAM_DOWN]);
  });
});

describe("GET /api/therapist/:slug", () => {
  it("returns 404 when UKCP has no such profile", async () => {
    const { request } = setup({ client: { profile: vi.fn(async () => null) } });
    const res = await request("/api/therapist/Nobody-ZZZZZZZZ");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([404, "no-store"]);
  });

  it("caches a profile for an hour", async () => {
    const html = `<div class="therapist-header"><h1>Jo Bloggs</h1></div>`;
    const { request } = setup({ client: { profile: vi.fn(async () => html) } });
    const res = await request("/api/therapist/Jo-Bloggs-ABCDEFGH");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([200, "public, max-age=3600"]);
    expect(await res.text()).toBe(html);
  });

  it("rejects slugs that could not be UKCP's", async () => {
    const { request } = setup();
    expect((await request("/api/therapist/..%2F..%2Fadmin")).status).toBe(400);
    expect((await request("/api/therapist/...")).status).toBe(400);
  });

  it("accepts slugs made from names with accents and apostrophes", async () => {
    const { request, stub } = setup({ client: { profile: vi.fn(async () => null) } });
    expect((await request("/api/therapist/Zo%C3%AB-O'Neill-QWERTY12")).status).toBe(404);
    expect(stub.profile).toHaveBeenCalledWith("Zoë-O'Neill-QWERTY12");
  });
});

describe("POST /api/contact/:id", () => {
  it("returns the details and is never cached", async () => {
    const html = `<div class="therapist-contacts-details-tel"><a href="tel:01234567890">01234 567890</a></div>`;
    const { request } = setup({ client: { contact: vi.fn(async () => html) } });
    const res = await request("/api/contact/9239", { method: "POST" });
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([200, "no-store"]);
    expect(await res.text()).toBe(html);
  });

  it("answers requests from this site's pages and refuses other sites'", async () => {
    const { request, stub } = setup({ client: { contact: vi.fn(async () => "") } });
    expect((await request("/api/contact/9239", { method: "POST", headers: { origin: "http://localhost" } })).status).toBe(200);
    expect((await request("/api/contact/9239", { method: "POST", headers: { origin: "https://elsewhere.example" } })).status).toBe(403);
    expect(stub.contact).toHaveBeenCalledOnce();
  });
});

describe("rateKey", () => {
  it("groups IPv6 visitors by /64 and leaves IPv4 alone", () => {
    expect(rateKey("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64");
    expect(rateKey("2001:DB8:1:0002::9")).toBe("2001:db8:1:2::/64");
    expect(rateKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(rateKey("203.0.113.9")).toBe("203.0.113.9");
  });
});
