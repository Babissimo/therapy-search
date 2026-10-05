import { inOrder } from "../../shared/order";
import type { SearchResult, TherapistCard } from "../../shared/types";
import { RESULTS_COUNT, RESULTS_NOTICE } from "../../shared/ukcp/markers";
import { ParseError, optional } from "../../shared/ukcp/text";
import { attribute, firstNamed, lineOf, withClass } from "./markup";

const RANGE = /(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+results?/i;
// A card's listing and the link that opens with it, which holds the whole card.
const LISTING = /<div\b[^>]*\sclass=(["'])(?:[^"']*\s)?profile-listing(?:\s[^"']*)?\1[^>]*>\s*(<a\b[^>]*>)/gi;

/** What the Worker reads of a card, which leaves out the phone number UKCP puts on it. */
export type Card = Pick<TherapistCard, "slug" | "name" | "location" | "distance" | "sessionTypes" | "summary" | "tags">;
/** A results page with the cards read from it. */
export type Results = Omit<SearchResult, "therapists" | "notices"> & { cards: Card[] };
/**
 * A card as first found: where its link's content starts, and what orders it. A plain page shows no photo and reads a
 * card whole only once it is shown, so cards here are ordered by their distance and the seed alone.
 */
type Found = { slug: string; start: number; distance?: string };

/**
 * UKCP's count and searched place, and the `count` cards after the first `skip`, read as parseResults reads them. With a
 * seed, every card's slug, and distance near a place, is read to put them in the seed's order. Without one they stay in
 * UKCP's order and only the page's opening and the cards up to the last shown are read, so a page of thousands costs
 * little more than a scan for where cards start.
 */
export function readResults(html: string, skip: number, count: number, seed?: number): Results {
  const first = html.search(LISTING);
  const opening = first < 0 ? html : html.slice(0, first);
  const searched = withClass(opening, "results-location")[0];
  const locationSearched = optional(lineOf(firstNamed(searched?.inner ?? "", "strong")?.inner ?? ""));
  // UKCP gives distances only for a search near a place, which the page names.
  const measured = locationSearched !== undefined;
  const shown =
    seed === undefined ? listed(html, skip, count) : inOrder([...html.matchAll(LISTING)].map((m) => foundAt(html, m, measured)), seed).slice(skip, skip + count);
  const cards = shown.map((card) => cardAt(html, card));

  const range = withClass(opening, RESULTS_COUNT)[0];
  if (!range) {
    const notices = withClass(opening, RESULTS_NOTICE).filter((notice) => lineOf(firstNamed(notice.inner, "h6")?.inner ?? "") !== "");
    if (first < 0 && notices.length > 0) return { total: 0, from: 0, to: 0, locationSearched, cards };
    throw new ParseError(`results: no .${RESULTS_COUNT} and no notice`);
  }
  const m = RANGE.exec(lineOf(range.inner));
  if (!m) throw new ParseError(`results: unreadable range "${lineOf(range.inner)}"`);
  return { total: Number(m[3]), from: Number(m[1]), to: Number(m[2]), locationSearched, cards };
}

/** The `count` cards after the first `skip` in UKCP's order, found without reading further. */
function listed(html: string, skip: number, count: number): Found[] {
  const found: Found[] = [];
  const listings = new RegExp(LISTING);
  for (let n = 0, m = listings.exec(html); m && n < skip + count; n++, m = listings.exec(html)) {
    if (n >= skip) found.push(foundAt(html, m, false));
  }
  return found;
}

function foundAt(html: string, m: RegExpExecArray, measured: boolean): Found {
  const slug = /therapist\/([^/?#]+)/.exec(attribute(m[2]!, "href") ?? "")?.[1];
  if (!slug) throw new ParseError("results: a card has no profile link");
  const start = m.index + m[0].length;
  return { slug, start, distance: measured ? distanceIn(locationsIn(cardFrom(html, start))) : undefined };
}

function cardAt(html: string, { slug, start }: Found): Card {
  const card = cardFrom(html, start);
  const name = lineOf(firstNamed(card, "h2")?.inner ?? "");
  if (!name) throw new ParseError("results: a card has no name");
  const locations = locationsIn(card);
  // The strong holds the phone, which is left to the profile's contact details.
  const sessions = (withClass(card, "profile-listing-contact-session-type")[0]?.inner ?? "").replace(/<strong\b[^>]*>[\s\S]*?<\/strong>/gi, "");
  return {
    slug,
    name,
    location: optional(lineOf(firstNamed(locations, "strong")?.inner ?? "")),
    distance: distanceIn(locations),
    sessionTypes: optional(lineOf(sessions).replace(/^\|\s*/, "")),
    summary: optional(lineOf(firstNamed(card, "p")?.inner ?? "")),
    tags: (withClass(card, "tag-list")[0]?.inner.match(/<li\b[^>]*>[\s\S]*?<\/li>/gi) ?? []).map(lineOf).filter(Boolean),
  };
}

/** The content of the card whose link's content starts at `start`, which is the whole card. */
function cardFrom(html: string, start: number): string {
  const end = html.indexOf("</a>", start);
  return html.slice(start, end < 0 ? undefined : end);
}

/**
 * What a card holds of its office's place and distance, as in `<strong>Hove BN3</strong> (1.2 miles from Brighton)`. It is
 * read for every card near a place, so found by its class's name alone and taken to the first span to close, as UKCP's
 * span holds no other.
 */
function locationsIn(card: string): string {
  const at = card.indexOf("profile-listing-locations");
  if (at < 0) return "";
  const from = card.indexOf(">", at) + 1;
  const end = card.indexOf("</span>", from);
  return card.slice(from, end < 0 ? undefined : end);
}

/** A card's distance, such as "0.6 miles from Brighton". */
function distanceIn(locations: string): string | undefined {
  return /\(([^)]*\bfrom\b[^)]*)\)/.exec(lineOf(locations))?.[1];
}
