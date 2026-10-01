import type { Office, Profile, ProfileSection } from "../types";
import { ParseError, initialsOf, multiLine, oneLine, optional, readHtml, safeUrl } from "./text";

export function parseProfile(html: string, slug: string): Profile {
  const doc = readHtml(html);
  // The header is what marks a profile page: a therapist may have written no biography at all.
  const name = oneLine(doc.querySelector(".therapist-header h1")?.textContent);
  if (!name) throw new ParseError("profile: no .therapist-header h1");

  const details = doc.querySelector(".therapist-contacts-details");
  const mailto = [...doc.querySelectorAll(".therapist-contacts a")]
    .map((a) => a.getAttribute("href") ?? "")
    .find((href) => href.startsWith("mailto:") && !href.startsWith("mailto:?"));

  return {
    slug,
    name,
    initials: initialsOf(name),
    photoUrl: safeUrl(doc.querySelector("img.therapist-photo")?.getAttribute("src")),
    location: optional(oneLine(doc.querySelector(".profile-intro-locations")?.textContent)),
    languages: oneLine(doc.querySelector(".profile-intro-languages")?.textContent)
      .split(",")
      .map((language) => language.trim())
      .filter(Boolean),
    email: mailto ? mailtoAddress(mailto) : undefined,
    contactId: details && details.getAttribute("data-nodata") !== "true" ? (details.getAttribute("data-id") ?? undefined) : undefined,
    emailInContact: doc.querySelector('.therapist-contacts-details[data-email="true"]') !== null,
    social: socialLinks(doc),
    about: sectionsIn(doc.querySelector(".profile-bio")),
    practical: sectionsIn(doc.querySelector(".profile-practical-information")),
    offices: [...doc.querySelectorAll(".profile-locations > section")].map(parseOffice),
  };
}

/** The address in a mailto link, without any ?subject=, and tolerant of a stray percent sign. */
function mailtoAddress(href: string): string | undefined {
  const address = href.slice("mailto:".length).split("?")[0] ?? "";
  try {
    return optional(decodeURIComponent(address).trim());
  } catch {
    return optional(address.trim());
  }
}

/** The page repeats the social media icons for each layout it offers, so each link is kept once. */
function socialLinks(doc: Document): string[] {
  const hrefs = [...doc.querySelectorAll(".profile-intro-social-media a")].map((a) => safeUrl(a.getAttribute("href")));
  return [...new Set(hrefs.filter((url): url is string => url !== undefined))];
}

/** The sections with something under their heading; a heading alone tells the visitor nothing. */
function sectionsIn(container: Element | null): ProfileSection[] {
  return [...(container?.querySelectorAll(":scope > section") ?? [])]
    .map(parseSection)
    .filter((s) => s.paragraphs.length + s.items.length + s.details.length > 0);
}

function parseSection(section: Element): ProfileSection {
  return {
    heading: oneLine(section.querySelector("h2, h3")?.textContent),
    // Text sits in <p> in biographies but in other elements elsewhere, such as the <span> under "Working with Children".
    paragraphs: [...section.children]
      .filter((el) => !/^(H2|H3|UL)$/.test(el.tagName) && !el.classList.contains("accordion-item") && !el.querySelector(".accordion-item"))
      .flatMap((el) => multiLine(el).split(/\n{2,}/))
      .filter(Boolean),
    items: [...section.querySelectorAll(":scope > ul > li")].map((li) => oneLine(li.textContent)).filter(Boolean),
    details: [...section.querySelectorAll(".accordion-item")].map((item) => ({
      title: oneLine(item.querySelector(".accordion-header")?.textContent),
      text: multiLine(item.querySelector(".accordion-body")),
    })),
  };
}

function parseOffice(section: Element): Office {
  const heading = section.querySelector("h3");
  const address = multiLine(section.querySelector("address")).split("\n").filter(Boolean);
  return {
    name: oneLine(heading?.textContent),
    isMain: Boolean(heading?.querySelector(".fa-star")),
    address,
    // UKCP links an office with no address to a map search for ", , ".
    mapUrl: address.length > 0 ? safeUrl(section.querySelector("a.mini-cta")?.getAttribute("href")) : undefined,
    cost: optional(costOf(section)),
  };
}

/** What follows an office's "Cost:" heading, up to any heading after it: the stretch the Worker reads a card's fee from. */
function costOf(section: Element): string {
  const heading = [...section.querySelectorAll("h4")].find((h) => /cost/i.test(h.textContent ?? ""));
  if (!heading) return "";
  const cost = section.ownerDocument.createElement("div");
  for (let node = heading.nextSibling; node && node.nodeName !== "H4"; node = node.nextSibling) cost.append(node.cloneNode(true));
  return multiLine(cost);
}
