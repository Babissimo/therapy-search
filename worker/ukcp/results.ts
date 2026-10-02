import type { SearchResult, TherapistCard } from "../../shared/types";
import { RESULTS_COUNT, RESULTS_NOTICE } from "../../shared/ukcp/markers";
import { ParseError, optional } from "../../shared/ukcp/text";
import { attribute, firstNamed, lineOf, withClass } from "./markup";

const RANGE = /(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+results?/i;
// A card's listing and the link that opens with it, which holds the whole card.
const LISTING = /<div\b[^>]*\sclass=(["'])(?:[^"']*\s)?profile-listing(?:\s[^"']*)?\1[^>]*>\s*(<a\b[^>]*>)/gi;

/** What a plain page shows of a card. */
export type Card = Pick<TherapistCard, "slug" | "name" | "location" | "distance" | "sessionTypes" | "summary">;
/** A results page with the cards a plain page shows from it. */
export type Results = Omit<SearchResult, "therapists" | "notices"> & { cards: Card[] };

/**
 * UKCP's count and searched place, and the `count` cards after the first `skip`, read as parseResults reads them. Only
 * the page's opening and those cards are read, so the rest of a page of thousands costs only a scan for where cards start.
 */
export function readResults(html: string, skip: number, count: number): Results {
  const first = html.search(LISTING);
  const opening = first < 0 ? html : html.slice(0, first);
  const searched = withClass(opening, "results-location")[0];
  const locationSearched = optional(lineOf(firstNamed(searched?.inner ?? "", "strong")?.inner ?? ""));
  const cards: Card[] = [];
  const listings = new RegExp(LISTING);
  for (let n = 0, m = listings.exec(html); m && n < skip + count; n++, m = listings.exec(html)) {
    if (n >= skip) cards.push(cardAt(html, m));
  }

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

function cardAt(html: string, m: RegExpExecArray): Card {
  const slug = /therapist\/([^/?#]+)/.exec(attribute(m[2]!, "href") ?? "")?.[1];
  if (!slug) throw new ParseError("results: a card has no profile link");
  const start = m.index + m[0].length;
  const end = html.indexOf("</a>", start);
  const card = html.slice(start, end < 0 ? undefined : end);

  const name = lineOf(firstNamed(card, "h2")?.inner ?? "");
  if (!name) throw new ParseError("results: a card has no name");
  const locations = withClass(card, "profile-listing-locations")[0]?.inner ?? "";
  // The strong holds the phone, which a plain page leaves to the profile's contact details.
  const sessions = (withClass(card, "profile-listing-contact-session-type")[0]?.inner ?? "").replace(/<strong\b[^>]*>[\s\S]*?<\/strong>/gi, "");
  return {
    slug,
    name,
    location: optional(lineOf(firstNamed(locations, "strong")?.inner ?? "")),
    distance: /\(([^)]*\bfrom\b[^)]*)\)/.exec(lineOf(locations))?.[1],
    sessionTypes: optional(lineOf(sessions).replace(/^\|\s*/, "")),
    summary: optional(lineOf(firstNamed(card, "p")?.inner ?? "")),
  };
}
