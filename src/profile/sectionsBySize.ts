import type { Profile } from "@shared/types";
import { withInterests, type ShownSection } from "./interests";

/**
 * Headings of the sections read at length, as UKCP spells them, compared without case, in the order the profile shows
 * them. About Me leads, as a search card's summary is its opening, which the visitor reads on into.
 */
const LONG = ["about me", "my approach", "what i can help with"];

const headingOf = (section: ShownSection) => section.heading.toLowerCase();

/**
 * A profile's sections, languages included and special interests folded in, split into those read at length, in LONG's
 * order, and the short rest, in UKCP's. Going by heading rather than length keeps a section in the same place on every
 * profile; an unknown heading is short.
 */
export function sectionsBySize(profile: Profile): { long: ShownSection[]; short: ShownSection[] } {
  const languages: ShownSection[] = profile.languages.length > 0 ? [{ heading: "Languages", paragraphs: [], items: profile.languages, details: [] }] : [];
  const sections = withInterests([...profile.about, ...languages, ...profile.practical]);
  const rank = (section: ShownSection) => LONG.indexOf(headingOf(section));
  const long = sections.filter((section) => rank(section) >= 0).sort((a, b) => rank(a) - rank(b));
  return { long, short: sections.filter((section) => rank(section) < 0) };
}
