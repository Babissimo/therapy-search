import type { SearchResult, TherapistCard } from "../types";
import { ParseError, initialsOf, oneLine, optional, readHtml, safeUrl } from "./text";

const RANGE = /(\d+)\s*-\s*(\d+)\s+of\s+(\d+)\s+results?/i;

export function parseResults(html: string): SearchResult {
  const doc = readHtml(html);
  const notices = [...doc.querySelectorAll(".fat-search-alert h6")].map((n) => oneLine(n.textContent)).filter(Boolean);
  const locationSearched = optional(oneLine(doc.querySelector(".results-location strong")?.textContent));
  const therapists = [...doc.querySelectorAll(".profile-listing > a")].map(parseCard);
  const range = doc.querySelector(".results-no");

  if (!range) {
    if (therapists.length === 0 && notices.length > 0) {
      return { total: 0, from: 0, to: 0, locationSearched, notices, therapists };
    }
    throw new ParseError("results: no .results-no and no notice");
  }
  const m = RANGE.exec(range.textContent ?? "");
  if (!m) throw new ParseError(`results: unreadable range "${oneLine(range.textContent)}"`);
  return { total: Number(m[3]), from: Number(m[1]), to: Number(m[2]), locationSearched, notices, therapists };
}

function parseCard(a: Element): TherapistCard {
  const href = a.getAttribute("href") ?? "";
  const slug = /therapist\/([^/?#]+)/.exec(href)?.[1];
  if (!slug) throw new ParseError("results: a card has no profile link");
  const name = oneLine(a.querySelector("h2")?.textContent);
  if (!name) throw new ParseError("results: a card has no name");

  const locations = a.querySelector(".profile-listing-locations");
  const contact = a.querySelector(".profile-listing-contact-session-type");
  const phone = optional(oneLine(contact?.querySelector("strong")?.textContent));
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
    distance: /\(([^)]*\bfrom\b[^)]*)\)/.exec(oneLine(locations?.textContent))?.[1],
    phone,
    sessionTypes: optional(oneLine(sessionText).replace(/^\|\s*/, "")),
    summary: optional(oneLine(a.querySelector("p")?.textContent)),
    tags: [...a.querySelectorAll(".tag-list li")].map((li) => oneLine(li.textContent)).filter(Boolean),
  };
}
