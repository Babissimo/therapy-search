import type { SearchResult, TherapistCard } from "../types";
import { ParseError, initialsOf, oneLine, optional, readHtml, safeUrl } from "./text";

const RANGE = /(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+results?/i;

/** A card found on a results page: enough to order it by, with the rest read only when it is shown. */
export type Listing = { slug: string; distance?: string; read: () => TherapistCard };
/** A results page with its cards not yet read. */
export type Listings = Omit<SearchResult, "therapists"> & { listings: Listing[] };

export function parseResults(html: string): SearchResult {
  const { listings, ...found } = parseListings(html);
  return { ...found, therapists: listings.map((listing) => listing.read()) };
}

/** Reads a results page but not its cards' details, which cost the most to read and are needed only for the cards shown. */
export function parseListings(html: string): Listings {
  const doc = readHtml(html);
  const notices = [...doc.querySelectorAll(".fat-search-alert h6")].map((n) => oneLine(n.textContent)).filter(Boolean);
  const locationSearched = optional(oneLine(doc.querySelector(".results-location strong")?.textContent));
  const listings = [...doc.querySelectorAll(".profile-listing > a")].map(listingOf);
  const range = doc.querySelector(".results-no");

  if (!range) {
    if (listings.length === 0 && notices.length > 0) {
      return { total: 0, from: 0, to: 0, locationSearched, notices, listings };
    }
    throw new ParseError("results: no .results-no and no notice");
  }
  const m = RANGE.exec(range.textContent ?? "");
  if (!m) throw new ParseError(`results: unreadable range "${oneLine(range.textContent)}"`);
  return { total: Number(m[3]), from: Number(m[1]), to: Number(m[2]), locationSearched, notices, listings };
}

function listingOf(a: Element): Listing {
  const href = a.getAttribute("href") ?? "";
  const slug = /therapist\/([^/?#]+)/.exec(href)?.[1];
  if (!slug) throw new ParseError("results: a card has no profile link");
  const distance = distanceOf(a);
  return { slug, distance, read: () => readCard(a, slug, distance) };
}

function distanceOf(a: Element): string | undefined {
  return /\(([^)]*\bfrom\b[^)]*)\)/.exec(oneLine(a.querySelector(".profile-listing-locations")?.textContent))?.[1];
}

function readCard(a: Element, slug: string, distance: string | undefined): TherapistCard {
  const name = oneLine(a.querySelector("h2")?.textContent);
  if (!name) throw new ParseError("results: a card has no name");

  const locations = a.querySelector(".profile-listing-locations");
  const contact = a.querySelector(".profile-listing-contact-session-type");
  // The strong holds the phone, which the list leaves to the profile's contact reveal.
  const sessionText = [...(contact?.childNodes ?? [])]
    .filter((n) => n.nodeName !== "STRONG")
    .map((n) => n.textContent ?? "")
    .join("");

  return {
    slug,
    name,
    initials: oneLine(a.querySelector(".profile-photo-placeholder span")?.textContent) || initialsOf(name),
    photoUrl: safeUrl(a.querySelector("img.profile-photo")?.getAttribute("src")),
    location: optional(oneLine(locations?.querySelector("strong")?.textContent)),
    distance,
    sessionTypes: optional(oneLine(sessionText).replace(/^\|\s*/, "")),
    summary: optional(oneLine(a.querySelector("p")?.textContent)),
    tags: [...a.querySelectorAll(".tag-list li")].map((li) => oneLine(li.textContent)).filter(Boolean),
  };
}
