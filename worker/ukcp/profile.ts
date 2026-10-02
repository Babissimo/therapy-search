import type { ContactDetails, Profile, ProfileSection } from "../../shared/types";
import { CONTACT_DETAIL, PROFILE_HEADER } from "../../shared/ukcp/markers";
import { ParseError, mailtoAddress, optional, safeUrl } from "../../shared/ukcp/text";
import { attribute, children, firstNamed, hasClass, lineOf, textOf, withClass, type Element } from "./markup";
import { officesIn } from "./offices";

/** What a plain page shows of a profile. */
export type PlainProfile = Pick<Profile, "name" | "location" | "languages" | "email" | "contactId" | "emailInContact" | "about" | "practical"> & {
  offices: ReturnType<typeof officesIn>;
};

/** A profile page read as parseProfile reads it, less its photo, social links and offices' maps. */
export function readProfile(html: string): PlainProfile {
  const name = lineOf(firstNamed(withClass(html, PROFILE_HEADER)[0]?.inner ?? "", "h1")?.inner ?? "");
  if (!name) throw new ParseError(`profile: no .${PROFILE_HEADER} h1`);

  const details = withClass(html, "therapist-contacts-details");
  const mailto = withClass(html, "therapist-contacts")
    .flatMap((contacts) => [...contacts.inner.matchAll(/<a\b[^>]*>/gi)].map(([a]) => attribute(a, "href") ?? ""))
    .find((href) => href.startsWith("mailto:") && !href.startsWith("mailto:?"));
  const nodata = details[0] && attribute(details[0].open, "data-nodata") === "true";

  return {
    name,
    location: optional(lineOf(withClass(html, "profile-intro-locations")[0]?.inner ?? "")),
    languages: lineOf(withClass(html, "profile-intro-languages")[0]?.inner ?? "")
      .split(",")
      .map((language) => language.trim())
      .filter(Boolean),
    email: mailto ? mailtoAddress(mailto) : undefined,
    contactId: details[0] && !nodata ? attribute(details[0].open, "data-id") : undefined,
    emailInContact: details.some((el) => attribute(el.open, "data-email") === "true"),
    about: sectionsIn(withClass(html, "profile-bio")[0]),
    practical: sectionsIn(withClass(html, "profile-practical-information")[0]),
    offices: officesIn(html),
  };
}

/** The contact details UKCP gives on request, read as parseContact reads them. */
export function readContact(html: string): ContactDetails {
  const link = (kind: string) => firstNamed(withClass(html, `${CONTACT_DETAIL}${kind}`)[0]?.inner ?? "", "a");
  const web = link("web");
  return {
    phone: optional(lineOf(link("tel")?.inner ?? "")),
    email: optional(lineOf(link("email")?.inner ?? "")),
    website: safeUrl(web && attribute(web.open, "href")),
  };
}

/** The sections directly in a container that have something under their heading. */
function sectionsIn(container: Element | undefined): ProfileSection[] {
  return children(container?.inner ?? "")
    .filter((el) => el.name === "section")
    .map(sectionOf)
    .filter((s) => s.paragraphs.length + s.items.length + s.details.length > 0);
}

function sectionOf(section: Element): ProfileSection {
  const parts = children(section.inner);
  const heading = /<(h[23])\b[^>]*>([\s\S]*?)<\/\1>/i.exec(section.inner)?.[2] ?? "";
  return {
    heading: lineOf(heading),
    // Text sits in <p> in biographies but in other elements elsewhere, such as the <span> under "Working with Children".
    paragraphs: parts
      .filter((el) => !/^(h2|h3|ul)$/.test(el.name) && !hasClass(el, "accordion-item") && withClass(el.inner, "accordion-item").length === 0)
      .flatMap((el) => textOf(el.inner).split(/\n{2,}/))
      .filter(Boolean),
    items: parts
      .filter((el) => el.name === "ul")
      .flatMap((ul) => children(ul.inner).filter((li) => li.name === "li"))
      .map((li) => lineOf(li.inner))
      .filter(Boolean),
    details: withClass(section.inner, "accordion-item").map((item) => ({
      title: lineOf(withClass(item.inner, "accordion-header")[0]?.inner ?? ""),
      text: textOf(withClass(item.inner, "accordion-body")[0]?.inner ?? ""),
    })),
  };
}
