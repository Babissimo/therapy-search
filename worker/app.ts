import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  LOCATION_MAX_LENGTH,
  canonicalLocation,
  classifyLocation,
  nearestQuery,
  placeQuery,
  type NearestLookup,
  type OfficePostcode,
  type PlaceLookup,
  type PlaceOptions,
} from "../shared/location";
import { ALLOWED } from "../shared/options";
import { InvalidParam, asksWhole, readParams, toQuery } from "../shared/query";
import { UpstreamError, type SessionStore, type UkcpClient } from "./ukcp/client";
import { officePostcode } from "./ukcp/offices";

export type RateLimit = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type Assets = { fetch(url: string): Promise<Response> };
export type Env = {
  ASSETS: Assets;
  UPSTREAM_LIMIT: RateLimit;
  PLACE_LIMIT: RateLimit;
  OFFICE_LIMIT: RateLimit;
  UKCP_SESSION: SessionStore;
  SITE_URL: string;
};
export type PlaceFinder = {
  lookup(text: string, options: PlaceOptions): Promise<PlaceLookup>;
  nearest(lat: number, lng: number): Promise<NearestLookup>;
};
/** The cached entrypoint, as the gateway reaches it. */
export type Cached = { fetch(request: Request): Promise<Response> };
type Ctx = Context<{ Bindings: Env }>;

const SEARCH_MAX_AGE = 15 * 60;
// A search without a location is asked for whole, UKCP's heaviest answer, and the browser orders it, so the entry's age
// decides only how soon someone joining or leaving UKCP shows.
const WHOLE_SEARCH_MAX_AGE = 6 * 60 * 60;
// UKCP opens a results page with its count or a notice; the rest can run to megabytes.
const OPENING_BYTES = 8 * 1024;
// Contact details are kept as long as the profile they belong to.
const PROFILE_MAX_AGE = 60 * 60;
// Places don't move; a miss is kept shorter in case the geocoders learn it.
const PLACE_FOUND_MAX_AGE = 30 * 24 * 60 * 60;
const PLACE_MISSING_MAX_AGE = 24 * 60 * 60;
// Offices rarely move, and the card asking, kept far less long, still decides who is listed and in which district. No
// postcode is kept for less, in case the therapist adds one or UKCP served the page without its offices.
const OFFICE_FOUND_MAX_AGE = 30 * 24 * 60 * 60;
const OFFICE_MISSING_MAX_AGE = 7 * 24 * 60 * 60;
/** The date of the last change to what an office lookup answers, which retires its cached answers as LOOKUP_VERSION does places'. */
export const OFFICE_VERSION = "2026-10-01";
// Vite names each built file by a hash of its content, so a browser can keep one for good.
const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
// Far more than the form can send; a body is read whole before it is checked.
const BODY_MAX_BYTES = 64 * 1024;
// The cache keys on path and query alone, so the host of the gateway's requests to it is arbitrary.
const CACHE_ORIGIN = "https://cache.internal";
/** Carries the visitor's allowance key from the gateway to the cached entrypoint; headers are no part of the cache key. */
export const RATE_KEY = "x-rate-key";
export const UPSTREAM_DOWN = "UKCP's search isn't responding. Try again, or search on UKCP directly.";
export const TOO_MANY = "Too many searches in a short time. Wait a minute and try again.";
export const PLACE_DOWN = "Couldn't look up that place just now.";
export const NEAREST_DOWN = "Couldn't find the nearest postcode just now.";
export const STALE_PAGE = "This page is out of date. Reload it to search.";
const NO_PROFILE = "This profile isn't on UKCP any more.";
// UKCP builds slugs from names, so they can carry accents and apostrophes.
const SLUG = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}'’.-]{2,119}$/u;

/**
 * The entrypoint visitors reach. Their searches arrive in request bodies, which Cloudflare's request analytics never
 * record, and go on to the cached entrypoint by canonical URL, which stays inside the Worker.
 */
export function createGateway(cachedFor: (c: Ctx) => Cached) {
  const app = new Hono<{ Bindings: Env }>();

  // Nothing about a search is kept in the browser; what the edge keeps is the cached entrypoint's to say.
  app.use("/api/*", async (c, next) => {
    await next();
    c.res.headers.set("Cache-Control", "no-store");
  });
  app.use("/api/*", bodyLimit({ maxSize: BODY_MAX_BYTES, onError: (c) => c.json({ error: "That request is too large." }, 413) }));

  app.post("/api/search", async (c) => {
    const query = toQuery(readParams(await formOf(c), ALLOWED));
    return forward(c, `/api/search${query ? `?${query}` : ""}`);
  });

  app.post("/api/therapist", async (c) => {
    const slug = (await formOf(c)).get("slug") ?? "";
    if (!SLUG.test(slug)) return c.json({ error: "That isn't a UKCP profile address." }, 400);
    return forward(c, `/api/therapist/${encodeURIComponent(slug)}`);
  });

  app.post("/api/contact", async (c) => {
    // Only our own pages may ask, so other sites can't make their visitors' browsers request contact details from UKCP.
    const site = c.req.header("sec-fetch-site");
    if (site === "cross-site" || site === "same-site") return c.json({ error: "Contact details can only be shown on this site." }, 403);
    const id = (await formOf(c)).get("id") ?? "";
    if (!/^\d{1,10}$/.test(id)) return c.json({ error: "That isn't a UKCP contact id." }, 400);
    return forward(c, `/api/contact/${id}`);
  });

  app.post("/api/place", async (c) => {
    const { text, options } = placeOf(await formOf(c));
    return forward(c, `/api/place?${placeQuery(text, options)}`);
  });

  app.post("/api/nearest", async (c) => {
    const { lat, lng } = pointOf(await formOf(c));
    // Rounded before it reaches the cache, so a finer point is never looked up or kept.
    return forward(c, `/api/nearest?${nearestQuery(lat, lng)}`);
  });

  app.post("/api/office", async (c) => {
    const form = await formOf(c);
    const slug = form.get("slug") ?? "";
    if (!SLUG.test(slug)) return c.json({ error: "That isn't a UKCP profile address." }, 400);
    // Read as a card's location is, so the district asked for is the one the browser took from the card.
    const district = classifyLocation(form.get("outcode") ?? "");
    if (district.kind !== "outcode" || district.rest !== "") throw new InvalidParam("outcode", "outcode must be a UK postcode district");
    return forward(c, `/api/office/${encodeURIComponent(slug)}?${new URLSearchParams({ outcode: district.outcode, v: OFFICE_VERSION })}`);
  });

  // Only a page loaded from an older deploy asks by URL; reloading brings one that doesn't.
  app.get("/api/*", (c) => c.json({ error: STALE_PAGE }, 410));

  // Built files are marked here rather than by a _headers rule, which would also mark the app's page that assets answer
  // for a name the running deploy lacks, such as a chunk a tab from an older deploy asks for.
  app.get("/assets/*", async (c) => {
    // Fetched without the visitor's conditional headers, since a 304 would fail the check below.
    const res = await c.env.ASSETS.fetch(c.req.url);
    if (!res.ok || res.headers.get("Content-Type")?.startsWith("text/html")) return c.json({ error: "Not found" }, 404, { "Cache-Control": "no-store" });
    const file = new Response(res.body, res);
    file.headers.set("Cache-Control", ASSET_CACHE_CONTROL);
    return file;
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError(answerError);

  /** Asks the cached entrypoint, which counts a miss against the visitor's allowance. */
  async function forward(c: Ctx, path: string): Promise<Response> {
    const key = rateKey(c.req.header("cf-connecting-ip") ?? "unknown");
    const res = await cachedFor(c).fetch(new Request(CACHE_ORIGIN + path, { headers: { [RATE_KEY]: key } }));
    // Copied, since a response from another entrypoint arrives with its headers fixed.
    return new Response(res.body, res);
  }

  return app;
}

/**
 * The cached entrypoint, reached only from the gateway and only by canonical URL. Workers Caching keeps its answers as
 * their Cache-Control allows, so it runs, and a search reaches UKCP, only when the cache has no answer.
 */
export function createCache(clientFor: (env: Env) => UkcpClient, placesFor: (env: Env) => PlaceFinder) {
  const app = new Hono<{ Bindings: Env }>();

  // Anything not explicitly cacheable must never be stored, errors above all.
  app.use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
  });

  app.get("/api/search", async (c) => {
    const params = readParams(new URL(c.req.url).searchParams, ALLOWED);
    if (!(await allow(c, c.env.UPSTREAM_LIMIT))) return c.json({ error: TOO_MANY }, 429);
    const body = expectOpening(await clientFor(c.env).search(params), "results-no", "fat-search-alert");
    return upstreamHtml(c, body, `public, max-age=${asksWhole(params) ? WHOLE_SEARCH_MAX_AGE : SEARCH_MAX_AGE}`);
  });

  app.get("/api/therapist/:slug", async (c) => {
    if (!(await allow(c, c.env.UPSTREAM_LIMIT))) return c.json({ error: TOO_MANY }, 429);
    const slug = c.req.param("slug");
    const html = await clientFor(c.env).profile(slug);
    if (html === null) return c.json({ error: NO_PROFILE }, 404);
    return upstreamHtml(c, expectPage(html, "therapist-header"), `public, max-age=${PROFILE_MAX_AGE}`);
  });

  app.get("/api/contact/:id", async (c) => {
    if (!(await allow(c, c.env.UPSTREAM_LIMIT))) return c.json({ error: TOO_MANY }, 429);
    const html = await clientFor(c.env).contact(c.req.param("id"));
    // UKCP answers an unknown id with an empty page, which is passed on but not kept, as is any page without details.
    return upstreamHtml(c, html, html.includes("therapist-contacts-details-") ? `public, max-age=${PROFILE_MAX_AGE}` : "no-store");
  });

  app.get("/api/place", async (c) => {
    const { text, options } = placeOf(new URL(c.req.url).searchParams);
    if (!(await allow(c, c.env.PLACE_LIMIT))) return c.json({ error: TOO_MANY }, 429);
    let lookup: PlaceLookup;
    try {
      lookup = await placesFor(c.env).lookup(text, options);
    } catch (error) {
      // The message names the service and status, never the text looked up.
      console.error(error instanceof Error ? `${error.name}: ${error.message}` : "place lookup failed");
      return c.json({ error: PLACE_DOWN }, 502);
    }
    return c.json(lookup, 200, { "Cache-Control": `public, max-age=${lookup.found ? PLACE_FOUND_MAX_AGE : PLACE_MISSING_MAX_AGE}` });
  });

  app.get("/api/nearest", async (c) => {
    const { lat, lng } = pointOf(new URL(c.req.url).searchParams);
    if (!(await allow(c, c.env.PLACE_LIMIT))) return c.json({ error: TOO_MANY }, 429);
    let nearest: NearestLookup;
    try {
      nearest = await placesFor(c.env).nearest(lat, lng);
    } catch (error) {
      // The message names the service and status, never the point looked up.
      console.error(error instanceof Error ? `${error.name}: ${error.message}` : "nearest lookup failed");
      return c.json({ error: NEAREST_DOWN }, 502);
    }
    return c.json(nearest, 200, { "Cache-Control": `public, max-age=${nearest.found ? PLACE_FOUND_MAX_AGE : PLACE_MISSING_MAX_AGE}` });
  });

  app.get("/api/office/:slug", async (c) => {
    if (!(await allow(c, c.env.OFFICE_LIMIT))) return c.json({ error: TOO_MANY }, 429);
    const html = await clientFor(c.env).profile(c.req.param("slug"));
    if (html === null) return c.json({ error: NO_PROFILE }, 404);
    const postcode = officePostcode(expectPage(html, "therapist-header"), new URL(c.req.url).searchParams.get("outcode") ?? "");
    const answer: OfficePostcode = postcode === undefined ? { found: false } : { found: true, postcode };
    return c.json(answer, 200, { "Cache-Control": `public, max-age=${answer.found ? OFFICE_FOUND_MAX_AGE : OFFICE_MISSING_MAX_AGE}` });
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));
  app.onError(answerError);

  return app;
}

function answerError(error: Error, c: Context): Response {
  if (error instanceof InvalidParam) return c.json({ error: error.message, param: error.param }, 400);
  if (error instanceof UpstreamError || error.name === "TimeoutError") {
    // The message names the status, never the visitor's query.
    console.error(`${error.name}: ${error.message}`);
    return c.json({ error: UPSTREAM_DOWN }, 502);
  }
  console.error(error);
  return c.json({ error: "Something went wrong." }, 500);
}

async function formOf(c: Ctx): Promise<URLSearchParams> {
  return new URLSearchParams(await c.req.text());
}

/** The text and options of a place lookup, in their canonical form. */
function placeOf(query: URLSearchParams): { text: string; options: PlaceOptions } {
  const text = canonicalLocation(query.get("q") ?? "");
  if (text.length === 0 || text.length > LOCATION_MAX_LENGTH) throw new InvalidParam("q", `q must be 1 to ${LOCATION_MAX_LENGTH} characters`);
  const country = query.get("country");
  if (country !== null && !/^[a-z]{2}$/i.test(country)) throw new InvalidParam("country", "country must be a two-letter country code");
  const options: PlaceOptions = {
    centre: query.get("centre") === "true",
    outsideUK: query.get("outsideUK") === "true",
    ...(country === null ? {} : { country: country.toLowerCase() }),
  };
  return { text, options };
}

function pointOf(query: URLSearchParams): { lat: number; lng: number } {
  return { lat: coordinate(query.get("lat"), "lat", 90), lng: coordinate(query.get("lng"), "lng", 180) };
}

function coordinate(text: string | null, param: string, limit: number): number {
  const degrees = Number(text);
  if (!text?.trim() || !Number.isFinite(degrees) || Math.abs(degrees) > limit) throw new InvalidParam(param, `${param} must be a number from -${limit} to ${limit}`);
  return degrees;
}

/** Passes on a page only if it has the element its parser starts from, so an error page is never cached. */
function expectPage(html: string, ...markers: string[]): string {
  if (!markers.some((marker) => html.includes(marker))) throw new UpstreamError(502, `UKCP's page had none of ${markers.join(", ")}`);
  return html;
}

/** `expectPage` for a results page, searching only its opening. */
function expectOpening(body: Uint8Array<ArrayBuffer>, ...markers: string[]): Uint8Array<ArrayBuffer> {
  expectPage(new TextDecoder().decode(body.subarray(0, OPENING_BYTES)), ...markers);
  return body;
}

/** UKCP's HTML for the browser to read, as plain text so it can't run as a page on this site. */
function upstreamHtml(c: Ctx, html: string | Uint8Array<ArrayBuffer>, cacheControl: string): Response {
  return c.body(html, 200, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": cacheControl });
}

/** Counts a request that will reach an upstream service against the visitor's per-minute allowance for it. */
async function allow(c: Ctx, limiter: RateLimit): Promise<boolean> {
  const { success } = await limiter.limit({ key: c.req.header(RATE_KEY) ?? "unknown" });
  return success;
}

/** IPv6 visitors usually hold a whole /64, so each /64 shares one allowance. */
export function rateKey(ip: string): string {
  if (!ip.includes(":") || ip.includes(".")) return ip;
  const [head = "", tail] = ip.split("::");
  const front = head ? head.split(":") : [];
  const back = tail ? tail.split(":") : [];
  const groups = [...front, ...Array<string>(Math.max(0, 8 - front.length - back.length)).fill("0"), ...back];
  return `${groups
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/64`;
}
