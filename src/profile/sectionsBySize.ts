import type { Profile } from "@shared/types";
import { withInterests, type ShownSection } from "./interests";

// Headings as UKCP spells them, compared without case, each list in the order the profile shows it.

/** The sections read at length. About Me leads, as a search card's summary is its opening, which the visitor reads on into. */
const LONG = ["about me", "my approach", "what i can help with"];

/** The short sections that settle whether the visitor can see the therapist at all, shown above the offices. */
const BEFORE_OFFICES = ["i work with", "types of sessions", "languages"];

const headingOf = (section: ShownSection) => section.heading.toLowerCase();

type Placed = { long: ShownSection[]; beforeOffices: ShownSection[]; afterOffices: ShownSection[] };

/**
 * A profile's sections, languages included and special interests folded in, split into those read at length and the
 * short ones either side of the offices: who the therapist works with, how and in what language above them, in our order,
 * and the rest below, in UKCP's. Going by heading rather than length keeps a section in the same place on every profile;
 * an unknown heading is short, below the offices.
 */
export function sectionsBySize(profile: Profile): Placed {
  const languages: ShownSection[] = profile.languages.length > 0 ? [{ heading: "Languages", paragraphs: [], items: profile.languages, details: [] }] : [];
  const sections = withInterests([...profile.about, ...languages, ...profile.practical]);
  const ranked = (order: string[]) => {
    const rank = (section: ShownSection) => order.indexOf(headingOf(section));
    return sections.filter((section) => rank(section) >= 0).sort((a, b) => rank(a) - rank(b));
  };
  const placed = [...LONG, ...BEFORE_OFFICES];
  return { long: ranked(LONG), beforeOffices: ranked(BEFORE_OFFICES), afterOffices: sections.filter((section) => !placed.includes(headingOf(section))) };
}
