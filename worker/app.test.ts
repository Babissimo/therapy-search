import { describe, expect, it, vi } from "vitest";
import { LOOKUP_VERSION, type PlaceLookup } from "../shared/location";
import { createApp, NEAREST_DOWN, PLACE_DOWN, rateKey, TOO_MANY, UPSTREAM_DOWN, type Env, type PlaceFinder } from "./app";
import { GeocodeError } from "./places/geocoder";
import { UpstreamError, type UkcpClient } from "./ukcp/client";

const RESULTS = `<span class="results-no">1-1 of 1 results</span>
<div class="profile-listing"><a href="therapist/Jo-Bloggs-ABCDEFGH"><h2>Jo Bloggs</h2></a></div>`;
const v = `v=${LOOKUP_VERSION}`;
const FOUND: PlaceLookup = { found: true, kind: "outcode", candidates: [{ lat: 50.835, lng: -0.178 }] };

const SCRIPT = () => new Response("export {};", { headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=0, must-revalidate", ETag: '"abc"' } });

function setup({
  allow = true,
  allowPlaces = true,
  client = {} as Partial<UkcpClient>,
  places = {} as Partial<PlaceFinder>,
  asset = SCRIPT as () => Response,
} = {}) {
  const limit = vi.fn(async () => ({ success: allow }));
  const placeLimit = vi.fn(async () => ({ success: allowPlaces }));
  // The routes are given a client, so the session store is never reached.
  const store = { get: async () => null, put: async () => {} };
  const assets = { fetch: vi.fn(async (_url: string) => asset()) };
  const env: Env = { ASSETS: assets, UPSTREAM_LIMIT: { limit }, PLACE_LIMIT: { limit: placeLimit }, UKCP_SESSION: store, SITE_URL: "https://example.test" };
  const stub = { search: vi.fn(async () => RESULTS), profile: vi.fn(), contact: vi.fn(), ...client } as unknown as UkcpClient;
  const finder: PlaceFinder = { lookup: vi.fn(async () => FOUND), nearest: vi.fn(async () => ({ found: true, postcode: "BN3 1FG" }) as const), ...places };
  const app = createApp(
    () => stub,
    () => finder,
  );
  const request = (path: string, init?: RequestInit) =>
    app.request(path, { ...init, headers: { "cf-connecting-ip": "203.0.113.9", ...init?.headers } }, env);
  return { request, stub, limit, placeLimit, finder, assets };
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

describe("GET /api/place", () => {
  it("returns a found place for 30 days, counted against the place limit only", async () => {
    const { request, finder, placeLimit, limit } = setup();
    const res = await request(`/api/place?q=BRIGHTON+BN3&${v}`);
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([200, "public, max-age=2592000"]);
    expect(await res.json()).toEqual(FOUND);
    expect(finder.lookup).toHaveBeenCalledWith("BRIGHTON BN3", { centre: false, outsideUK: false });
    expect(placeLimit).toHaveBeenCalledWith({ key: "203.0.113.9" });
    expect(limit).not.toHaveBeenCalled();
  });

  it("keeps a miss for a day", async () => {
    const { request } = setup({ places: { lookup: vi.fn(async (): Promise<PlaceLookup> => ({ found: false, reason: "not-found" })) } });
    const res = await request(`/api/place?q=NOWHERE&${v}`);
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([200, "public, max-age=86400"]);
  });

  it("passes the centre and outside-UK flags on", async () => {
    const { request, finder } = setup();
    expect((await request(`/api/place?q=PARIS&centre=true&outsideUK=true&${v}`)).status).toBe(200);
    expect(finder.lookup).toHaveBeenCalledWith("PARIS", { centre: true, outsideUK: true });
  });

  it("redirects other spellings of a lookup to the canonical one without looking it up", async () => {
    const { request, finder } = setup();
    const res = await request("/api/place?centre=false&q=brighton%20%20bn3");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(`/api/place?q=BRIGHTON+BN3&${v}`);
    expect(finder.lookup).not.toHaveBeenCalled();
  });

  it("redirects a lookup from an older version to the current one", async () => {
    const { request, finder } = setup();
    const res = await request("/api/place?q=BRIGHTON&v=2000-01-01");
    // Never kept, or a rollback would bounce between two versions until the entry expired.
    expect([res.status, res.headers.get("Location"), res.headers.get("Cache-Control")]).toEqual([301, `/api/place?q=BRIGHTON&${v}`, "no-store"]);
    expect(finder.lookup).not.toHaveBeenCalled();
  });

  it("rejects text that is empty or too long", async () => {
    const { request } = setup();
    expect((await request("/api/place?q=%20")).status).toBe(400);
    expect((await request(`/api/place?q=${"A".repeat(101)}`)).status).toBe(400);
  });

  it("answers 429 over the place limit without looking anything up", async () => {
    const { request, finder } = setup({ allowPlaces: false });
    const res = await request(`/api/place?q=BRIGHTON&${v}`);
    expect([res.status, (await res.json()).error]).toEqual([429, TOO_MANY]);
    expect(finder.lookup).not.toHaveBeenCalled();
  });

  it("answers 502, uncached, when a geocoder fails", async () => {
    const { request } = setup({ places: { lookup: vi.fn(async () => Promise.reject(new GeocodeError("api.postcodes.io answered 500"))) } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(`/api/place?q=BN3&${v}`);
    expect([res.status, res.headers.get("Cache-Control"), (await res.json()).error]).toEqual([502, "no-store", PLACE_DOWN]);
    expect(log).toHaveBeenCalledWith("GeocodeError: api.postcodes.io answered 500");
  });
});

describe("GET /api/nearest", () => {
  it("answers the postcode nearest a rounded point, which the edge may cache for 30 days", async () => {
    const { request, finder, placeLimit } = setup();
    const res = await request(`/api/nearest?lat=50.826&lng=-0.160&${v}`);
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([200, "public, max-age=2592000"]);
    expect(await res.json()).toEqual({ found: true, postcode: "BN3 1FG" });
    expect(finder.nearest).toHaveBeenCalledWith(50.826, -0.16);
    expect(placeLimit).toHaveBeenCalledOnce();
  });

  it("keeps a point with no postcode near it for a day", async () => {
    const { request } = setup({ places: { nearest: vi.fn(async () => ({ found: false }) as const) } });
    const res = await request(`/api/nearest?lat=59.000&lng=-3.000&${v}`);
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([200, "public, max-age=86400"]);
  });

  it("redirects a finer point to its rounded one without looking it up", async () => {
    const { request, finder } = setup();
    const res = await request("/api/nearest?lat=50.82614&lng=-0.15987");
    expect(res.status).toBe(301);
    expect(res.headers.get("Location")).toBe(`/api/nearest?lat=50.826&lng=-0.160&${v}`);
    expect(finder.nearest).not.toHaveBeenCalled();
  });

  it("rejects a point that isn't one", async () => {
    const { request, finder } = setup();
    for (const query of ["lat=abc&lng=0", "lat=91&lng=0", "lat=0&lng=-181", "lat=51.5", "lat=&lng=0"]) {
      expect((await request(`/api/nearest?${query}`)).status).toBe(400);
    }
    expect(finder.nearest).not.toHaveBeenCalled();
  });

  it("answers 429 over the place limit without looking anything up", async () => {
    const { request, finder } = setup({ allowPlaces: false });
    const res = await request(`/api/nearest?lat=50.826&lng=-0.160&${v}`);
    expect([res.status, (await res.json()).error]).toEqual([429, TOO_MANY]);
    expect(finder.nearest).not.toHaveBeenCalled();
  });

  it("answers 502, uncached, when postcodes.io fails, logging no position", async () => {
    const { request } = setup({ places: { nearest: vi.fn(async () => Promise.reject(new GeocodeError("api.postcodes.io answered 500"))) } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await request(`/api/nearest?lat=50.826&lng=-0.160&${v}`);
    expect([res.status, res.headers.get("Cache-Control"), (await res.json()).error]).toEqual([502, "no-store", NEAREST_DOWN]);
    expect(log).toHaveBeenCalledWith("GeocodeError: api.postcodes.io answered 500");
  });
});

describe("GET /assets/*", () => {
  it("marks a built file immutable for a year", async () => {
    const { request } = setup();
    const res = await request("/assets/index-CaFBIOBx.js");
    expect([res.status, res.headers.get("Cache-Control"), res.headers.get("ETag")]).toEqual([200, "public, max-age=31536000, immutable", '"abc"']);
    expect(await res.text()).toBe("export {};");
  });

  it("asks assets for the whole file, whatever the browser sent", async () => {
    const { request, assets } = setup();
    await request("/assets/index-CaFBIOBx.js", { headers: { "If-None-Match": '"abc"', Range: "bytes=0-1" } });
    expect(assets.fetch).toHaveBeenCalledWith("http://localhost/assets/index-CaFBIOBx.js");
  });

  it("answers 404, uncached, where assets would send the app's page for a name no deploy has", async () => {
    const { request } = setup({ asset: () => new Response("<!doctype html>", { headers: { "Content-Type": "text/html; charset=utf-8" } }) });
    const res = await request("/assets/MapPane-OldHash.js");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([404, "no-store"]);
  });

  it("keeps nothing assets could not serve", async () => {
    const { request } = setup({ asset: () => new Response(null, { status: 404 }) });
    const res = await request("/assets/missing.css");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([404, "no-store"]);
  });
});
