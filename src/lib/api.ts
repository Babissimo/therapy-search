import { parseContact } from "@shared/ukcp/parseContact";
import { parseProfile } from "@shared/ukcp/parseProfile";
import { parseListings, type Listings } from "@shared/ukcp/parseResults";
import { ParseError } from "@shared/ukcp/text";
import { nearestQuery, placeQuery, type NearestLookup, type OfficePostcode, type PlaceLookup, type PlaceOptions } from "@shared/location";
import { limitConcurrency } from "./limit";

export const UNREADABLE = "UKCP's pages have changed, so this site can't read them yet. Search on UKCP directly.";

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

/** The Worker passes UKCP's HTML through untouched; the page reads it here, in the browser. */
async function request<T>(url: string, read: (html: string) => T, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw await failure(res);
  const html = await res.text();
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
  const res = await fetch(url, init);
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
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
