import { parseContact } from "@shared/ukcp/parseContact";
import { parseProfile } from "@shared/ukcp/parseProfile";
import { parseListings, type Listings } from "@shared/ukcp/parseResults";
import { ParseError } from "@shared/ukcp/text";
import { nearestQuery, placeQuery, type NearestLookup, type OfficePostcode, type PlaceLookup, type PlaceOptions } from "@shared/location";
import { limitConcurrency } from "./limit";

export const UNREADABLE = "UKCP's pages have changed, so this site can't read them yet. Search on UKCP directly.";
export const OFFLINE = "Couldn't reach the internet. Check your connection and try again.";
export const STALLED = "This is taking too long. Check your connection and try again.";

// Long enough for a whole-list search, UKCP's slowest answer, to come over a slow connection.
const TIMEOUT_MS = 30_000;

// Each uncached office lookup reads a profile from UKCP, which would otherwise see a page's twelve at once.
const officeTurns = limitConcurrency(4);

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function failure(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => ({}));
  return new ApiError(res.status, (body as { error?: string }).error ?? "Something went wrong.");
}

/**
 * What is asked travels in the body, since Cloudflare's request analytics keep each address beside the visitor's IP;
 * the Worker asks its cache by address in its place.
 */
function post(body: string | Record<string, string>): RequestInit {
  return { method: "POST", body: new URLSearchParams(body) };
}

/**
 * What `url` answers, read by `body`, with a connection that drops or stalls reported in words a visitor can act on. A
 * request still unanswered after TIMEOUT_MS has stalled, rather than leaving the page waiting for good.
 */
async function answer<B>(url: string, { signal, ...init }: RequestInit, body: (res: Response) => Promise<B>): Promise<B> {
  // Aborted by the caller's signal or by the timeout, whichever comes first; AbortSignal.any reaches Safari only in 17.4.
  const abort = new AbortController();
  let stalled = false;
  const timer = setTimeout(() => {
    stalled = true;
    abort.abort();
  }, TIMEOUT_MS);
  const cancel = () => abort.abort(signal?.reason);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel);
  try {
    const res = await fetch(url, { ...init, signal: abort.signal });
    if (!res.ok) throw await failure(res);
    return await body(res);
  } catch (error) {
    if (stalled) throw new ApiError(0, STALLED);
    // fetch rejects with a TypeError when no answer comes at all: offline, or the connection dropped.
    if (error instanceof TypeError) throw new ApiError(0, OFFLINE);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

/** The Worker passes UKCP's HTML through untouched; the page reads it here, in the browser. */
async function request<T>(url: string, read: (html: string) => T, init: RequestInit): Promise<T> {
  const html = await answer(url, init, (res) => res.text());
  return readable(() => read(html));
}

/** Reads UKCP's HTML, reporting markup it can't read as UKCP having changed. */
function readable<T>(read: () => T): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof ParseError) throw new ApiError(502, UNREADABLE);
    throw error;
  }
}

/** A results page whose cards, read later as they are shown, report unreadable markup as the page itself does. */
function listingsOf(html: string): Listings {
  const found = parseListings(html);
  return { ...found, listings: found.listings.map((listing) => ({ ...listing, read: () => readable(listing.read) })) };
}

async function json<T>(url: string, init: RequestInit): Promise<T> {
  return answer(url, init, (res) => res.json() as Promise<T>);
}

export const api = {
  search: (query: string) => request("/api/search", listingsOf, post(query)),
  profile: (slug: string) => request("/api/therapist", (html) => parseProfile(html, slug), post({ slug })),
  contact: (id: string) => request("/api/contact", parseContact, post({ id })),
  place: (text: string, options: PlaceOptions = {}) => json<PlaceLookup>("/api/place", post(placeQuery(text, options))),
  nearest: (lat: number, lng: number) => json<NearestLookup>("/api/nearest", post(nearestQuery(lat, lng))),
  office: (slug: string, outcode: string, signal?: AbortSignal) =>
    officeTurns(() => json<OfficePostcode>("/api/office", { ...post({ slug, outcode }), signal }), signal),
};
