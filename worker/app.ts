import { Hono, type Context } from "hono";
import { ALLOWED } from "../shared/options";
import { InvalidParam, readParams, toQuery } from "../shared/query";
import { UpstreamError, type UkcpClient } from "./ukcp/client";

export type RateLimit = { limit(options: { key: string }): Promise<{ success: boolean }> };
export type Env = { UPSTREAM_LIMIT: RateLimit; SITE_URL: string };
type Ctx = Context<{ Bindings: Env }>;

const SEARCH_MAX_AGE = 15 * 60;
const PROFILE_MAX_AGE = 60 * 60;
export const UPSTREAM_DOWN = "UKCP's search isn't responding. Try again, or search on UKCP directly.";
export const TOO_MANY = "Too many searches in a short time. Wait a minute and try again.";
// UKCP builds slugs from names, so they can carry accents and apostrophes.
const SLUG = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}'’.-]{2,119}$/u;

export function createApp(clientFor: (env: Env) => UkcpClient) {
  const app = new Hono<{ Bindings: Env }>();

  // Anything not explicitly cacheable must never be stored: errors, redirects to bad input, contact details.
  app.use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
  });

  app.get("/api/search", async (c) => {
    const url = new URL(c.req.url);
    const params = readParams(url.searchParams, ALLOWED);
    const canonical = toQuery(params, { withSeed: true });
    // Compared as parsed parameters, so a proxy re-encoding the query can't cause a redirect loop.
    if (new URLSearchParams(url.search).toString() !== canonical) {
      return c.redirect(`/api/search${canonical ? `?${canonical}` : ""}`, 301);
    }
    if (!(await allowUpstream(c))) return c.json({ error: TOO_MANY }, 429);
    const html = expectPage(await clientFor(c.env).search(params), "results-no", "fat-search-alert");
    return upstreamHtml(c, html, `public, max-age=${SEARCH_MAX_AGE}`);
  });

  app.get("/api/therapist/:slug", async (c) => {
    const slug = c.req.param("slug");
    if (!SLUG.test(slug)) return c.json({ error: "That isn't a UKCP profile address." }, 400);
    if (!(await allowUpstream(c))) return c.json({ error: TOO_MANY }, 429);
    const html = await clientFor(c.env).profile(slug);
    if (html === null) return c.json({ error: "This profile isn't on UKCP any more." }, 404);
    return upstreamHtml(c, expectPage(html, "therapist-header"), `public, max-age=${PROFILE_MAX_AGE}`);
  });

  app.post("/api/contact/:id", async (c) => {
    // Only our own pages may ask, so other sites can't make their visitors' browsers request contact details from UKCP.
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "Contact details can only be shown on this site." }, 403);
    const id = c.req.param("id");
    if (!/^\d{1,10}$/.test(id)) return c.json({ error: "That isn't a UKCP contact id." }, 400);
    if (!(await allowUpstream(c))) return c.json({ error: TOO_MANY }, 429);
    return upstreamHtml(c, await clientFor(c.env).contact(id), "no-store");
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

/** Passes on a page only if it has the element its parser starts from, so an error page is never cached. */
function expectPage(html: string, ...markers: string[]): string {
  if (!markers.some((marker) => html.includes(marker))) throw new UpstreamError(502, `UKCP's page had none of ${markers.join(", ")}`);
  return html;
}

/** UKCP's HTML for the browser to read, as plain text so it can't run as a page on this site. */
function upstreamHtml(c: Ctx, html: string, cacheControl: string): Response {
  return c.body(html, 200, { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": cacheControl });
}

/** Counts a request that will reach UKCP against the visitor's per-minute allowance. */
async function allowUpstream(c: Ctx): Promise<boolean> {
  const { success } = await c.env.UPSTREAM_LIMIT.limit({ key: rateKey(c.req.header("cf-connecting-ip") ?? "unknown") });
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
