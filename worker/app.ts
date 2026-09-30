import { Hono, type Context } from "hono";
import { LOCATION_MAX_LENGTH, canonicalLocation, nearestQuery, placeQuery, type NearestLookup, type PlaceLookup, type PlaceOptions } from "../shared/location";
import { ALLOWED } from "../shared/options";
import { InvalidParam, asksWhole, readParams, toQuery } from "../shared/query";
import { UpstreamError, type SessionStore, type UkcpClient } from "./ukcp/client";

export type RateLimit = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type Assets = { fetch(url: string): Promise<Response> };
export type Env = { ASSETS: Assets; UPSTREAM_LIMIT: RateLimit; PLACE_LIMIT: RateLimit; UKCP_SESSION: SessionStore; SITE_URL: string };
export type PlaceFinder = {
  lookup(text: string, options: PlaceOptions): Promise<PlaceLookup>;
  nearest(lat: number, lng: number): Promise<NearestLookup>;
};
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
// Vite names each built file by a hash of its content, so a browser can keep one for good.
const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const UPSTREAM_DOWN = "UKCP's search isn't responding. Try again, or search on UKCP directly.";
export const TOO_MANY = "Too many searches in a short time. Wait a minute and try again.";
export const PLACE_DOWN = "Couldn't look up that place just now.";
export const NEAREST_DOWN = "Couldn't find the nearest postcode just now.";
// UKCP builds slugs from names, so they can carry accents and apostrophes.
const SLUG = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}'’.-]{2,119}$/u;

export function createApp(clientFor: (env: Env) => UkcpClient, placesFor: (env: Env) => PlaceFinder) {
  const app = new Hono<{ Bindings: Env }>();

  // Anything not explicitly cacheable must never be stored: errors and redirects to bad input.
  app.use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
  });

  app.get("/api/search", async (c) => {
    const url = new URL(c.req.url);
    const params = readParams(url.searchParams, ALLOWED);
    const canonical = toQuery(params);
    // Compared as parsed parameters, so a proxy re-encoding the query can't cause a redirect loop.
    if (new URLSearchParams(url.search).toString() !== canonical) {
      return c.redirect(`/api/search${canonical ? `?${canonical}` : ""}`, 301);
    }
    if (!(await allow(c, c.env.UPSTREAM_LIMIT))) return c.json({ error: TOO_MANY }, 429);
    const body = expectOpening(await clientFor(c.env).search(params), "results-no", "fat-search-alert");
    return upstreamHtml(c, body, `public, max-age=${asksWhole(params) ? WHOLE_SEARCH_MAX_AGE : SEARCH_MAX_AGE}`);
  });

  app.get("/api/therapist/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!SLUG.test(slug)) return c.json({ error: "That isn't a UKCP profile address." }, 400);
    if (!(await allow(c, c.env.UPSTREAM_LIMIT))) return c.json({ error: TOO_MANY }, 429);
    const html = await clientFor(c.env).profile(slug);
    if (html === null) return c.json({ error: "This profile isn't on UKCP any more." }, 404);
    return upstreamHtml(c, expectPage(html, "therapist-header"), `public, max-age=${PROFILE_MAX_AGE}`);
  });

  app.get("/api/contact/:id", async (c) => {
    // Only our own pages may ask, so other sites can't make their visitors' browsers request contact details from UKCP.
    const site = c.req.header("sec-fetch-site");
    if (site === "cross-site" || site === "same-site") return c.json({ error: "Contact details can only be shown on this site." }, 403);
    const id = c.req.param("id");
    if (!/^\d{1,10}$/.test(id)) return c.json({ error: "That isn't a UKCP contact id." }, 400);
    if (!(await allow(c, c.env.UPSTREAM_LIMIT))) return c.json({ error: TOO_MANY }, 429);
    const html = await clientFor(c.env).contact(id);
    // UKCP answers an unknown id with an empty page, which is passed on but not kept, as is any page without details.
    return upstreamHtml(c, html, html.includes("therapist-contacts-details-") ? `public, max-age=${PROFILE_MAX_AGE}` : "no-store");
  });

  app.get("/api/place", async (c) => {
    const url = new URL(c.req.url);
    const text = canonicalLocation(url.searchParams.get("q") ?? "");
    if (text.length === 0 || text.length > LOCATION_MAX_LENGTH) throw new InvalidParam("q", `q must be 1 to ${LOCATION_MAX_LENGTH} characters`);
    const country = url.searchParams.get("country");
    if (country !== null && !/^[a-z]{2}$/i.test(country)) throw new InvalidParam("country", "country must be a two-letter country code");
    const options: PlaceOptions = {
      centre: url.searchParams.get("centre") === "true",
      outsideUK: url.searchParams.get("outsideUK") === "true",
      ...(country === null ? {} : { country: country.toLowerCase() }),
    };
    const canonical = placeQuery(text, options);
    // Compared as parsed parameters, as for searches, so re-encoding can't cause a redirect loop.
    if (new URLSearchParams(url.search).toString() !== canonical) return c.redirect(`/api/place?${canonical}`, 301);
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
    const url = new URL(c.req.url);
    const lat = coordinate(url.searchParams.get("lat"), "lat", 90);
    const lng = coordinate(url.searchParams.get("lng"), "lng", 180);
    const canonical = nearestQuery(lat, lng);
    // The browser rounds the point before asking; anything finer is redirected, so it is never looked up or cached.
    if (new URLSearchParams(url.search).toString() !== canonical) return c.redirect(`/api/nearest?${canonical}`, 301);
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

  app.onError((error, c) => {
    if (error instanceof InvalidParam) return c.json({ error: error.message, param: error.param }, 400);
    if (error instanceof UpstreamError || error.name === "TimeoutError") {
      // The message names the status, never the visitor's query.
      console.error(`${error.name}: ${error.message}`);
      return c.json({ error: UPSTREAM_DOWN }, 502);
    }
    console.error(error);
    return c.json({ error: "Something went wrong." }, 500);
  });

  return app;
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
  const { success } = await limiter.limit({ key: rateKey(c.req.header("cf-connecting-ip") ?? "unknown") });
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
