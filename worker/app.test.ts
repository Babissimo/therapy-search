import { describe, expect, it, vi } from "vitest";
import { LOCATION_MAX_LENGTH, LOOKUP_VERSION, type PlaceLookup } from "../shared/location";
import { EARLY_SIZE } from "../shared/query";
import {
  createCache,
  createGateway,
  NEAREST_DOWN,
  OFFICE_VERSION,
  PLACE_DOWN,
  RATE_KEY,
  rateKey,
  STALE_PAGE,
  TOO_MANY,
  UPSTREAM_DOWN,
  type Env,
  type PlaceFinder,
} from "./app";
import { GeocodeError } from "./places/geocoder";
import { UpstreamError, type UkcpClient } from "./ukcp/client";

const RESULTS = `<span class="results-no">1-1 of 1 results</span>
<div class="profile-listing"><a href="therapist/Jo-Bloggs-ABCDEFGH"><h2>Jo Bloggs</h2></a></div>`;
const bytes = (text: string) => new TextEncoder().encode(text);
const v = `v=${LOOKUP_VERSION}`;
const FOUND: PlaceLookup = { found: true, kind: "outcode", candidates: [{ lat: 50.835, lng: -0.178 }] };

const SCRIPT = () => new Response("export {};", { headers: { "Content-Type": "text/javascript", "Cache-Control": "public, max-age=0, must-revalidate", ETag: '"abc"' } });

function setup({
  allow = true,
  allowPlaces = true,
  allowOffices = true,
  allowEarly = true,
  client = {} as Partial<UkcpClient>,
  places = {} as Partial<PlaceFinder>,
  asset = SCRIPT as () => Response,
} = {}) {
  const limit = vi.fn(async () => ({ success: allow }));
  const placeLimit = vi.fn(async () => ({ success: allowPlaces }));
  const officeLimit = vi.fn(async () => ({ success: allowOffices }));
  const earlyLimit = vi.fn(async () => ({ success: allowEarly }));
  // The routes are given a client, so the session store is never reached.
  const store = { get: async () => null, put: async () => {} };
  const assets = { fetch: vi.fn(async (_url: string) => asset()) };
  const env: Env = {
    ASSETS: assets,
    UPSTREAM_LIMIT: { limit },
    PLACE_LIMIT: { limit: placeLimit },
    OFFICE_LIMIT: { limit: officeLimit },
    EARLY_LIMIT: { limit: earlyLimit },
    UKCP_SESSION: store,
    SITE_URL: "https://example.test",
  };
  const stub = { search: vi.fn(async () => bytes(RESULTS)), profile: vi.fn(), contact: vi.fn(), ...client } as unknown as UkcpClient;
  const finder: PlaceFinder = { lookup: vi.fn(async () => FOUND), nearest: vi.fn(async () => ({ found: true, postcode: "BN3 1FG" }) as const), ...places };
  const cache = createCache(
    () => stub,
    () => finder,
  );
  const forwarded = vi.fn(async (req: Request) => cache.fetch(req, env));
  const gateway = createGateway(() => ({ fetch: forwarded }));
  /** What the cached entrypoint was asked for, as path and query. */
  const asked = () => forwarded.mock.calls.map(([req]) => new URL(req.url).pathname + new URL(req.url).search);
  const request = (path: string, init?: RequestInit) =>
    gateway.request(path, { ...init, headers: { "cf-connecting-ip": "203.0.113.9", ...init?.headers } }, env);
  const post = (path: string, body: string, headers?: Record<string, string>) => request(path, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers } });
  /** The cached entrypoint answering the gateway directly, to read what the edge may keep. */
  const cached = (path: string) => cache.request(path, { headers: { [RATE_KEY]: "203.0.113.9" } }, env);
  return { request, post, cached, asked, forwarded, stub, limit, placeLimit, officeLimit, earlyLimit, finder, assets };
}

describe("the gateway", () => {
  it("keeps every answer to a visitor out of the browser's cache, though the edge may keep it", async () => {
    const { post, cached } = setup();
    expect((await post("/api/search", "Location=Leeds")).headers.get("Cache-Control")).toBe("no-store");
    expect((await cached("/api/search?Location=Leeds")).headers.get("Cache-Control")).toBe("public, max-age=900");
  });

  it("passes the cache the visitor's allowance key, one per IPv6 /64", async () => {
    const { post, forwarded, limit } = setup();
    await post("/api/search", "Location=Leeds", { "cf-connecting-ip": "2001:db8:1:2:3:4:5:6" });
    expect(forwarded.mock.calls[0]?.[0].headers.get(RATE_KEY)).toBe("2001:db8:1:2::/64");
    expect(limit).toHaveBeenCalledWith({ key: "2001:db8:1:2::/64" });
  });

  it("refuses a body too big for any search, without asking the cache", async () => {
    const { post, forwarded } = setup();
    const res = await post("/api/search", `KeywordFilter=${"a".repeat(70_000)}`);
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([413, "no-store"]);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("tells a page that asks by address to reload, rather than answering it", async () => {
    const { request, forwarded } = setup();
    for (const path of ["/api/search?Location=Leeds", "/api/place?q=BN3", "/api/therapist/Jo-Bloggs-ABCDEFGH"]) {
      const res = await request(path);
      expect([res.status, res.headers.get("Cache-Control"), (await res.json()).error]).toEqual([410, "no-store", STALE_PAGE]);
    }
    expect(forwarded).not.toHaveBeenCalled();
  });
});

describe("POST /api/search", () => {
  it("returns UKCP's results as plain text, asked of the cache by the search's canonical URL", async () => {
    const { post, asked, stub, limit } = setup();
    const res = await post("/api/search", "Languages=Spanish&Languages=French&Distance=10&page=1");
    expect(res.status).toBe(200);
    expect([res.headers.get("Content-Type"), res.headers.get("X-Content-Type-Options")]).toEqual(["text/plain; charset=utf-8", "nosniff"]);
    expect(await res.text()).toBe(RESULTS);
    expect(asked()).toEqual(["/api/search?Languages=French&Languages=Spanish"]);
    expect(stub.search).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.9" });
  });

  it("lets the edge keep a search for 15 minutes, or 6 hours for one without a location, which is asked for whole", async () => {
    const { cached } = setup();
    expect((await cached("/api/search?Location=Leeds")).headers.get("Cache-Control")).toBe("public, max-age=900");
    expect((await cached("/api/search?TypesOfSession=Online+Therapy")).headers.get("Cache-Control")).toBe("public, max-age=21600");
  });

  it("passes UKCP's page on byte for byte", async () => {
    const page = bytes(`${RESULTS}<p>Zoë O’Brien</p>${"x".repeat(20_000)}`);
    const { post } = setup({ client: { search: vi.fn(async () => page) } });
    const res = await post("/api/search", "Location=Leeds");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(page);
  });

  it("looks for the results' count or UKCP's notice only in a page's opening", async () => {
    const late = bytes(`<p>Down for maintenance</p>${" ".repeat(8 * 1024)}${RESULTS}`);
    const { post } = setup({ client: { search: vi.fn(async () => late) } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("/api/search", "Location=Leeds")).status).toBe(502);
  });

  it("rejects values UKCP's form does not offer without asking the cache", async () => {
    const { post, forwarded } = setup();
    const res = await post("/api/search", "Languages=Klingon");
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ param: "Languages" });
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("answers 429 without calling UKCP once the visitor is over the limit", async () => {
    const { post, stub } = setup({ allow: false });
    const res = await post("/api/search", "Location=Leeds");
    expect([res.status, (await res.json()).error]).toEqual([429, TOO_MANY]);
    expect(stub.search).not.toHaveBeenCalled();
  });

  it("answers 502, which the edge never keeps, when UKCP sends a page that isn't search results", async () => {
    const { post, cached } = setup({ client: { search: vi.fn(async () => bytes("<p>Down for maintenance</p>")) } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("/api/search", "Location=Leeds")).status).toBe(502);
    const res = await cached("/api/search?Location=Leeds");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([502, "no-store"]);
  });

  it("answers 502 when UKCP fails", async () => {
    const { post } = setup({ client: { search: vi.fn(async () => Promise.reject(new UpstreamError(503, "UKCP answered 503"))) } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post("/api/search", "Location=Leeds");
    expect([res.status, (await res.json()).error]).toEqual([502, UPSTREAM_DOWN]);
  });
});

describe("POST /api/search/early", () => {
  it("asks UKCP for a location search's nearest few, by the search's canonical URL, which the edge keeps for 15 minutes", async () => {
    const { post, asked, cached, stub } = setup();
    const res = await post("/api/search/early", "Location=Leeds&Languages=Spanish&Languages=French&page=3");
    expect([res.status, res.headers.get("Content-Type"), await res.text()]).toEqual([200, "text/plain; charset=utf-8", RESULTS]);
    expect(asked()).toEqual(["/api/search/early?Location=Leeds&Languages=French&Languages=Spanish"]);
    expect(stub.search).toHaveBeenCalledWith(expect.objectContaining({ page: 1, text: expect.objectContaining({ Location: "Leeds" }) }), EARLY_SIZE);
    expect((await cached("/api/search/early?Location=Leeds")).headers.get("Cache-Control")).toBe("public, max-age=900");
  });

  it("counts against an allowance of its own, so it never spends a search's", async () => {
    const { post, stub, limit, earlyLimit } = setup({ allowEarly: false });
    const res = await post("/api/search/early", "Location=Leeds");
    expect([res.status, (await res.json()).error]).toEqual([429, TOO_MANY]);
    expect(earlyLimit).toHaveBeenCalledWith({ key: "203.0.113.9" });
    expect(limit).not.toHaveBeenCalled();
    expect(stub.search).not.toHaveBeenCalled();
  });

  it("refuses a search without a location, which is asked for whole, without asking the cache", async () => {
    const { post, forwarded, cached, stub } = setup();
    const res = await post("/api/search/early", "TypesOfSession=Online+Therapy");
    expect([res.status, res.headers.get("Cache-Control"), (await res.json()).param]).toEqual([400, "no-store", "Location"]);
    expect(forwarded).not.toHaveBeenCalled();
    expect((await cached("/api/search/early?TypesOfSession=Online+Therapy")).status).toBe(400);
    expect(stub.search).not.toHaveBeenCalled();
  });

  it("answers 502, which the edge never keeps, when UKCP sends a page that isn't search results", async () => {
    const { cached } = setup({ client: { search: vi.fn(async () => bytes("<p>Down for maintenance</p>")) } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await cached("/api/search/early?Location=Leeds");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([502, "no-store"]);
  });
});

describe("POST /api/therapist", () => {
  const html = `<div class="therapist-header"><h1>Jo Bloggs</h1></div>`;

  it("returns a profile, which the edge may keep for an hour", async () => {
    const { post, cached, asked } = setup({ client: { profile: vi.fn(async () => html) } });
    const res = await post("/api/therapist", "slug=Jo-Bloggs-ABCDEFGH");
    expect([res.status, await res.text()]).toEqual([200, html]);
    expect(asked()).toEqual(["/api/therapist/Jo-Bloggs-ABCDEFGH"]);
    expect((await cached("/api/therapist/Jo-Bloggs-ABCDEFGH")).headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("returns 404, which the edge never keeps, when UKCP has no such profile", async () => {
    const { post, cached } = setup({ client: { profile: vi.fn(async () => null) } });
    expect((await post("/api/therapist", "slug=Nobody-ZZZZZZZZ")).status).toBe(404);
    const res = await cached("/api/therapist/Nobody-ZZZZZZZZ");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([404, "no-store"]);
  });

  it("rejects slugs that could not be UKCP's without asking the cache", async () => {
    const { post, forwarded } = setup();
    for (const slug of ["../../admin", "...", ""]) expect((await post("/api/therapist", new URLSearchParams({ slug }).toString())).status).toBe(400);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("accepts slugs made from names with accents and apostrophes", async () => {
    const { post, stub } = setup({ client: { profile: vi.fn(async () => null) } });
    expect((await post("/api/therapist", new URLSearchParams({ slug: "Zoë-O'Neill-QWERTY12" }).toString())).status).toBe(404);
    expect(stub.profile).toHaveBeenCalledWith("Zoë-O'Neill-QWERTY12");
  });
});

describe("POST /api/contact", () => {
  const CONTACT = `<div class="therapist-contacts-details-tel"><a href="tel:01234567890">01234 567890</a></div>`;

  it("returns the details as plain text, which the edge may keep for an hour", async () => {
    const { post, cached, asked, stub } = setup({ client: { contact: vi.fn(async () => CONTACT) } });
    const res = await post("/api/contact", "id=9239");
    expect([res.status, res.headers.get("Content-Type"), await res.text()]).toEqual([200, "text/plain; charset=utf-8", CONTACT]);
    expect(asked()).toEqual(["/api/contact/9239"]);
    expect(stub.contact).toHaveBeenCalledWith("9239");
    expect((await cached("/api/contact/9239")).headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("passes on an answer without details, which the edge never keeps", async () => {
    const { cached } = setup({ client: { contact: vi.fn(async () => "\r\n") } });
    const res = await cached("/api/contact/999999999");
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([200, "no-store"]);
  });

  it("rejects an id that isn't UKCP's without asking the cache", async () => {
    const { post, forwarded } = setup();
    expect((await post("/api/contact", "id=12a")).status).toBe(400);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("answers requests from this site's pages and refuses other sites'", async () => {
    const { post, forwarded } = setup({ client: { contact: vi.fn(async () => CONTACT) } });
    const from = (site: string) => post("/api/contact", "id=9239", { "sec-fetch-site": site });
    expect((await from("same-origin")).status).toBe(200);
    const refused = await from("cross-site");
    expect([refused.status, refused.headers.get("Cache-Control")]).toEqual([403, "no-store"]);
    expect((await from("same-site")).status).toBe(403);
    expect(forwarded).toHaveBeenCalledOnce();
  });
});

describe("POST /api/office", () => {
  const PROFILE = `<div class="therapist-header"><h1>Jo Bloggs</h1></div>
<div class="profile-locations"><section><h3>Hove</h3><address>2 Church Road<br>Hove BN3 2FL</address><h4>Cost:</h4><span>£70</span></section></div>
<div class="profile-locations"><section><h3>Brighton</h3><address>Brighton BN1</address><h4>Cost:</h4><span>£60</span></section></div>
<div class="profile-locations"><section><h3>Lewes</h3><address>Lewes BN7</address></section></div>`;
  const office = `/api/office/Jo-Bloggs-ABCDEFGH?location=HOVE+BN3&v=${OFFICE_VERSION}`;
  const officeIn = (location: string) => `/api/office/Jo-Bloggs-ABCDEFGH?${new URLSearchParams({ location, v: OFFICE_VERSION })}`;

  it("asks the cache by slug, card location and version, and answers the office's postcode and fee, which the edge may keep for 30 days", async () => {
    const { post, cached, asked, stub } = setup({ client: { profile: vi.fn(async () => PROFILE) } });
    const res = await post("/api/office", "slug=Jo-Bloggs-ABCDEFGH&location=hove++bn3+");
    expect([res.status, await res.json()]).toEqual([200, { postcode: "BN3 2FL", cost: "£70" }]);
    expect(asked()).toEqual([office]);
    expect(stub.profile).toHaveBeenCalledWith("Jo-Bloggs-ABCDEFGH");
    expect((await cached(office)).headers.get("Cache-Control")).toBe("public, max-age=2592000");
  });

  it("keeps a fee without a postcode for 30 days too", async () => {
    const { cached } = setup({ client: { profile: vi.fn(async () => PROFILE) } });
    const res = await cached(officeIn("BRIGHTON BN1"));
    expect([res.status, await res.json(), res.headers.get("Cache-Control")]).toEqual([200, { cost: "£60" }, "public, max-age=2592000"]);
  });

  it("answers nothing, kept for a week, when the office gives neither or no office is the card's", async () => {
    const { cached } = setup({ client: { profile: vi.fn(async () => PROFILE) } });
    for (const location of ["LEWES BN7", "LONDON E8"]) {
      const res = await cached(officeIn(location));
      expect([res.status, await res.json(), res.headers.get("Cache-Control")]).toEqual([200, {}, "public, max-age=604800"]);
    }
  });

  it("rejects a slug or location it can't use without asking the cache", async () => {
    const { post, forwarded } = setup();
    const long = "B".repeat(LOCATION_MAX_LENGTH + 1);
    for (const body of ["slug=../../admin&location=BN3", "slug=Jo-Bloggs-ABCDEFGH&location=+", `slug=Jo-Bloggs-ABCDEFGH&location=${long}`, "slug=Jo-Bloggs-ABCDEFGH"]) {
      expect((await post("/api/office", body)).status).toBe(400);
    }
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("counts a miss against the office allowance alone, and refuses one past it", async () => {
    const { post, limit, officeLimit } = setup({ allowOffices: false, client: { profile: vi.fn(async () => PROFILE) } });
    const res = await post("/api/office", "slug=Jo-Bloggs-ABCDEFGH&location=Hove+BN3");
    expect([res.status, await res.json()]).toEqual([429, { error: TOO_MANY }]);
    expect(officeLimit).toHaveBeenCalledWith({ key: "203.0.113.9" });
    expect(limit).not.toHaveBeenCalled();
  });

  it("returns 404, which the edge never keeps, when UKCP has no such profile", async () => {
    const { cached } = setup({ client: { profile: vi.fn(async () => null) } });
    const res = await cached(`/api/office/Nobody-ZZZZZZZZ?location=HOVE+BN3&v=${OFFICE_VERSION}`);
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([404, "no-store"]);
  });

  it("keeps nothing when UKCP answers with something other than a profile", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { cached } = setup({ client: { profile: vi.fn(async () => "<p>Down for maintenance</p>") } });
    const res = await cached(office);
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([502, "no-store"]);
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

describe("POST /api/place", () => {
  it("returns a found place, counted against the place limit only", async () => {
    const { post, finder, placeLimit, limit } = setup();
    const res = await post("/api/place", "q=BRIGHTON+BN3");
    expect([res.status, await res.json()]).toEqual([200, FOUND]);
    expect(finder.lookup).toHaveBeenCalledWith("BRIGHTON BN3", { centre: false, outsideUK: false });
    expect(placeLimit).toHaveBeenCalledWith({ key: "203.0.113.9" });
    expect(limit).not.toHaveBeenCalled();
  });

  it("lets the edge keep a found place for 30 days and a miss for a day", async () => {
    const { cached } = setup();
    expect((await cached(`/api/place?q=BRIGHTON+BN3&${v}`)).headers.get("Cache-Control")).toBe("public, max-age=2592000");
    const missing = setup({ places: { lookup: vi.fn(async (): Promise<PlaceLookup> => ({ found: false, reason: "not-found" })) } });
    expect((await missing.cached(`/api/place?q=NOWHERE&${v}`)).headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("asks the cache by the lookup's canonical URL, at the current version", async () => {
    const { post, asked } = setup();
    expect((await post("/api/place", "centre=false&q=brighton%20%20bn3&v=2000-01-01")).status).toBe(200);
    expect(asked()).toEqual([`/api/place?q=BRIGHTON+BN3&${v}`]);
  });

  it("passes the centre and outside-UK flags on", async () => {
    const { post, finder } = setup();
    expect((await post("/api/place", "q=PARIS&centre=true&outsideUK=true")).status).toBe(200);
    expect(finder.lookup).toHaveBeenCalledWith("PARIS", { centre: true, outsideUK: true });
  });

  it("passes a country on in lower case, and refuses anything but a two-letter code", async () => {
    const { post, finder, asked } = setup();
    expect((await post("/api/place", "q=BERLIN&centre=true&country=DE")).status).toBe(200);
    expect(finder.lookup).toHaveBeenCalledWith("BERLIN", { centre: true, outsideUK: false, country: "de" });
    expect(asked()).toEqual([`/api/place?q=BERLIN&centre=true&country=de&${v}`]);
    expect((await post("/api/place", "q=BERLIN&country=deu")).status).toBe(400);
  });

  it("rejects text that is empty or too long", async () => {
    const { post, forwarded } = setup();
    expect((await post("/api/place", "q=%20")).status).toBe(400);
    expect((await post("/api/place", `q=${"A".repeat(101)}`)).status).toBe(400);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("answers 429 over the place limit without looking anything up", async () => {
    const { post, finder } = setup({ allowPlaces: false });
    const res = await post("/api/place", "q=BRIGHTON");
    expect([res.status, (await res.json()).error]).toEqual([429, TOO_MANY]);
    expect(finder.lookup).not.toHaveBeenCalled();
  });

  it("answers 502 when a geocoder fails, logging only the service", async () => {
    const { post } = setup({ places: { lookup: vi.fn(async () => Promise.reject(new GeocodeError("api.postcodes.io answered 500"))) } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post("/api/place", "q=BN3");
    expect([res.status, (await res.json()).error]).toEqual([502, PLACE_DOWN]);
    expect(log).toHaveBeenCalledWith("GeocodeError: api.postcodes.io answered 500");
  });
});

describe("POST /api/nearest", () => {
  it("answers the postcode nearest a point, asked of the cache rounded to about 100 metres", async () => {
    const { post, asked, finder, placeLimit } = setup();
    const res = await post("/api/nearest", "lat=50.82614&lng=-0.15987");
    expect([res.status, await res.json()]).toEqual([200, { found: true, postcode: "BN3 1FG" }]);
    expect(asked()).toEqual([`/api/nearest?lat=50.826&lng=-0.160&${v}`]);
    expect(finder.nearest).toHaveBeenCalledWith(50.826, -0.16);
    expect(placeLimit).toHaveBeenCalledOnce();
  });

  it("lets the edge keep a postcode for 30 days, and a point with none near it for a day", async () => {
    const { cached } = setup();
    expect((await cached(`/api/nearest?lat=50.826&lng=-0.160&${v}`)).headers.get("Cache-Control")).toBe("public, max-age=2592000");
    const nowhere = setup({ places: { nearest: vi.fn(async () => ({ found: false }) as const) } });
    expect((await nowhere.cached(`/api/nearest?lat=59.000&lng=-3.000&${v}`)).headers.get("Cache-Control")).toBe("public, max-age=86400");
  });

  it("rejects a point that isn't one", async () => {
    const { post, forwarded } = setup();
    for (const body of ["lat=abc&lng=0", "lat=91&lng=0", "lat=0&lng=-181", "lat=51.5", "lat=&lng=0"]) {
      expect((await post("/api/nearest", body)).status).toBe(400);
    }
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("answers 429 over the place limit without looking anything up", async () => {
    const { post, finder } = setup({ allowPlaces: false });
    const res = await post("/api/nearest", "lat=50.826&lng=-0.160");
    expect([res.status, (await res.json()).error]).toEqual([429, TOO_MANY]);
    expect(finder.nearest).not.toHaveBeenCalled();
  });

  it("answers 502 when postcodes.io fails, logging no position", async () => {
    const { post } = setup({ places: { nearest: vi.fn(async () => Promise.reject(new GeocodeError("api.postcodes.io answered 500"))) } });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post("/api/nearest", "lat=50.826&lng=-0.160");
    expect([res.status, (await res.json()).error]).toEqual([502, NEAREST_DOWN]);
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
