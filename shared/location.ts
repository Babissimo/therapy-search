/** Location text as UKCP shows it on result cards and in "Location searched", and what looking it up returns. */

export const LOCATION_MAX_LENGTH = 100;

/** `country`, a two-letter code, keeps Nominatim to that country and skips the UK's postcode rules. */
export type PlaceOptions = { centre?: boolean; outsideUK?: boolean; country?: string };

export type Candidate = { lat: number; lng: number; type?: string };

export type PlaceLookup =
  | { found: true; kind: "postcode" | "outcode" | "place"; candidates: Candidate[] }
  | { found: false; reason: "too-general" | "not-found" };

export type LocationText =
  | { kind: "postcode"; postcode: string; outcode: string; rest: string }
  | { kind: "outcode"; outcode: string; rest: string }
  | { kind: "place"; name: string }
  | { kind: "too-general" };

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})\b/;
const LAST_OUTCODE = /(?:^|\s)([A-Z]{1,2}\d[A-Z\d]?)$/;
// A country after a postcode or outcode, as in "HOVE BN3, UK", is no part of either.
const LAST_COUNTRY = /(?:, ?| )(?:UK|UNITED KINGDOM)[,.]?$/;
// A bare postcode area, such as the "BN" in "BRIGHTON BN", narrows nothing a geocoder can use.
const LAST_AREA = /(?:^|\s)[A-Z]{1,2}$/;

/** One spelling per location, so equal texts share a cache entry. */
export function canonicalLocation(text: string): string {
  return text.trim().replace(/\s+/g, " ").toUpperCase();
}

/** Place and office lookups answer by this, so a change to what it answers needs LOOKUP_VERSION and OFFICE_VERSION (worker/app.ts) bumped. */
export function classifyLocation(text: string): LocationText {
  const canonical = canonicalLocation(text);
  const coded = canonical.replace(LAST_COUNTRY, "");
  const postcode = POSTCODE.exec(coded);
  if (postcode) {
    const [whole, outcode = "", incode = ""] = postcode;
    return { kind: "postcode", postcode: `${outcode} ${incode}`, outcode, rest: placeName(coded.replace(whole, " ")) };
  }
  const outcode = LAST_OUTCODE.exec(coded);
  if (outcode) return { kind: "outcode", outcode: outcode[1] ?? "", rest: placeName(coded.slice(0, outcode.index)) };
  const name = placeName(canonical);
  return name ? { kind: "place", name } : { kind: "too-general" };
}

/** The words a geocoder could place, or "" when none are left. */
function placeName(text: string): string {
  const name = canonicalLocation(canonicalLocation(text).replace(LAST_AREA, ""));
  return /[A-Z]/.test(name) ? name : "";
}

/** The one query string for a lookup: fixed key order, flags only when set. */
export function placeQuery(text: string, { centre = false, outsideUK = false, country }: PlaceOptions = {}): string {
  const query = new URLSearchParams({ q: canonicalLocation(text) });
  if (centre) query.set("centre", "true");
  if (outsideUK) query.set("outsideUK", "true");
  if (country) query.set("country", country.toLowerCase());
  return query.toString();
}

// Most settled first: with nothing else to go on, a bare place name more likely means the bigger place.
const SETTLEMENTS = ["city", "town", "other settlement", "suburban area", "village", "hamlet"];
const SETTLEMENT_ALIASES: Record<string, string> = { suburb: "suburban area" };

/** Where a candidate's settlement type sits in that order; unknown types come last. */
export function settlementRank(type: string | undefined): number {
  const rank = SETTLEMENTS.indexOf(SETTLEMENT_ALIASES[type ?? ""] ?? type ?? "");
  return rank === -1 ? SETTLEMENTS.length : rank;
}

/** The postcode nearest the visitor, for a search from where they are. */
export type NearestLookup = { found: true; postcode: string } | { found: false };

/** The one query string for a nearest-postcode lookup, rounded to about 100 metres: near enough to place a postcode, not to pinpoint a home. */
export function nearestQuery(lat: number, lng: number): string {
  // Math.round turns a small negative into -0, which prints without its sign, so each point has one spelling.
  const rounded = (degrees: number) => (Math.round(degrees * 1000) / 1000).toFixed(3);
  return new URLSearchParams({ lat: rounded(lat), lng: rounded(lng) }).toString();
}

/** UKCP answers a place it doesn't know with results from anywhere, saying only that it searched "United Kingdom". */
export function locationFellBack(typed: string, searched: string | undefined): boolean {
  const place = typed.trim();
  return place !== "" && searched === "United Kingdom" && !/^(uk|united kingdom)$/i.test(place);
}
