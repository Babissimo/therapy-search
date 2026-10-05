import { Hono, type Context } from "hono";
import type { ContentfulStatusCode, RedirectStatusCode } from "hono/utils/http-status";
import { locationFellBack } from "../../shared/location";
import { narrowsOnline, onlineSearch } from "../../shared/online";
import { newSeed, readSeed } from "../../shared/order";
import { ALLOWED } from "../../shared/options";
import { InvalidParam, PAGE_SIZE, batchSize, emptyParams, readParams, toQuery, type SearchParams } from "../../shared/query";
import type { ContactDetails } from "../../shared/types";
import { ParseError } from "../../shared/ukcp/text";
import type { Env, Forward } from "../app";
import { SLUG } from "../ukcp/client";
import { readContact, readProfile, type PlainProfile } from "../ukcp/profile";
import { readResults, type Results } from "../ukcp/results";
import { INVALID, NEEDS_FILTER, NO_PLACE, UNREADABLE, messagePage, profilePage, resultsPage, searchPage, unrecognised, type Asked, type Html } from "./pages";

type Ctx = Context<{ Bindings: Env }>;

// Back reaches a page of results without sending its form again, and the edge keeps none of them. No page runs script.
const HEADERS = {
  "Cache-Control": "private, no-cache",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

/**
 * A search that works without the app, its pages drawn here. Every search and profile asked for arrives in a POST body
 * and goes on to the cached entrypoint as the app's do, so no address the Worker is asked for carries one.
 */
export function plainSearch(forward: Forward) {
  const plain = new Hono<{ Bindings: Env }>();

  // An address here with a trailing slash leads to the one without, leaving any query behind. A form sent to one goes on
  // with its body, by a 307 since some browsers this serves predate 308, and is checked where it lands.
  plain.use("*", async (c, next) => {
    if (!c.req.path.endsWith("/")) return next();
    // As sent, so its percent-encoding stays; one spelling "plain" itself in escapes goes to the search.
    const to = new URL(c.req.url).pathname.replace(/\/+$/, "");
    return redirect(c, to.startsWith("/plain") ? to : "/plain", c.req.method === "GET" || c.req.method === "HEAD" ? 301 : 307);
  });

  plain.get("/", (c) => page(c, searchPage({ online: false, params: emptyParams(), shown: 0 })));

  plain.post("/", async (c) => {
    const form = await formOf(c);
    const online = form.get("mode") === "online";
    // A search's first page draws the seed of its order, which its forms carry on, so its pages, and the searches refined
    // from it, keep one order.
    const seed = readSeed(form.get("seed")) ?? newSeed();
    let asked: Asked;
    try {
      asked = { online, params: readParams(form, ALLOWED), shown: shownOf(form), seed };
    } catch (error) {
      if (!(error instanceof InvalidParam)) throw error;
      return page(c, searchPage({ online, params: leniently(form), shown: 0, seed }, { search: INVALID }), 400);
    }
    const { params, shown } = asked;
    if (!online && params.text.Location === "") return page(c, searchPage(asked, { place: NO_PLACE }));
    if (online && !narrowsOnline(params)) return page(c, searchPage(asked, { filters: NEEDS_FILTER }));

    // The batch holding this page, asked for by the URL the app asks for it by, so the two share the cache's answer.
    const search = online ? onlineSearch(params) : params;
    const size = batchSize(search);
    const batch = Math.floor(shown / size) + 1;
    const res = await forward(c, `/api/search?${toQuery({ ...search, page: batch })}`);
    if (!res.ok) return page(c, searchPage(asked, { search: await errorOf(res) }), res.status as ContentfulStatusCode);
    let results: Results;
    try {
      // Ordering a whole online set of thousands would take more CPU than a request has, so it keeps UKCP's order, which
      // the cache holds for 6 hours.
      results = readResults(await res.text(), shown - (batch - 1) * size, PAGE_SIZE, online ? undefined : seed);
    } catch (error) {
      return unreadable(c, error, searchPage(asked, { search: UNREADABLE }));
    }
    // UKCP answers a place it doesn't know with results from anywhere, which would answer no one looking near it.
    if (!online && locationFellBack(params.text.Location, results.locationSearched)) {
      return page(c, searchPage(asked, { place: unrecognised(params.text.Location) }));
    }
    return page(c, resultsPage(asked, results));
  });

  plain.post("/therapist", async (c) => {
    // As the API's contact route, so other sites can't make their visitors' browsers ask UKCP for contact details.
    const site = c.req.header("sec-fetch-site");
    if (site === "cross-site" || site === "same-site") return page(c, messagePage("Profile not shown", "Contact details can only be shown on this site."), 403);
    const slug = (await formOf(c)).get("slug") ?? "";
    if (!SLUG.test(slug)) return page(c, messagePage("Profile not found", "That isn't a UKCP profile address."), 400);

    const res = await forward(c, `/api/therapist/${encodeURIComponent(slug)}`);
    if (!res.ok) return page(c, messagePage(res.status === 404 ? "Profile not found" : "Profile not shown", await errorOf(res)), res.status as ContentfulStatusCode);
    let profile: PlainProfile;
    try {
      profile = readProfile(await res.text());
    } catch (error) {
      return unreadable(c, error, messagePage("Profile not shown", UNREADABLE));
    }
    // UKCP gives a phone and website only on request, which the app makes as a profile opens.
    let contact: ContactDetails = {};
    let contactProblem: string | undefined;
    if (profile.contactId !== undefined && /^\d{1,10}$/.test(profile.contactId)) {
      const reply = await forward(c, `/api/contact/${profile.contactId}`);
      if (reply.ok) contact = readContact(await reply.text());
      else contactProblem = await errorOf(reply);
    }
    return page(c, profilePage(slug, profile, contact, contactProblem));
  });

  // A profile is reached by its form alone; its address leads to a new search.
  plain.get("/therapist", (c) => redirect(c, "/plain", 303));
  plain.all("*", (c) => page(c, messagePage("Page not found", "There's no page at this address."), 404));

  plain.onError((error, c) => {
    console.error(error);
    return page(c, messagePage("Something went wrong", "Something went wrong. Try again, or search on UKCP directly."), 500);
  });

  return plain;
}

/** The page "too large" draws, for the gateway's body limit to answer with. */
export function tooLarge(c: Ctx) {
  return page(c, messagePage("Search not sent", "That search is too large to send."), 413);
}

function page(c: Ctx, body: Html, status: ContentfulStatusCode = 200) {
  return c.html(body, status, HEADERS);
}

/** A redirect the edge keeps no more than a page. */
function redirect(c: Ctx, to: string, status: RedirectStatusCode) {
  c.header("Cache-Control", HEADERS["Cache-Control"]);
  return c.redirect(to, status);
}

/** A page UKCP has changed so far that it can't be read, said as such; any other error goes on to the error page. */
function unreadable(c: Ctx, error: unknown, said: Html) {
  if (!(error instanceof ParseError)) throw error;
  // The message names the markup missed, never the visitor's search.
  console.error(`${error.name}: ${error.message}`);
  return page(c, said, 502);
}

async function formOf(c: Ctx): Promise<URLSearchParams> {
  return new URLSearchParams(await c.req.text());
}

/** How many results came before the page asked for: a whole number, or none. */
function shownOf(form: URLSearchParams): number {
  const shown = Number(form.get("shown") ?? "0");
  return Number.isInteger(shown) && shown >= 0 && shown <= 100_000 ? shown : 0;
}

/** The search as the form gave it, to fill the form in again, with no option checked against UKCP's. */
function leniently(form: URLSearchParams): SearchParams {
  try {
    return readParams(form);
  } catch {
    return emptyParams();
  }
}

/** What the cached entrypoint said went wrong, in the words the app shows. */
async function errorOf(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => ({}));
  return (body as { error?: string }).error ?? "Something went wrong.";
}
