import type { Profile } from "@shared/types";
import { withInterests, type ShownSection } from "./interests";

/** Headings of the sections read at length, as UKCP spells them, compared without case. */
const LONG = new Set(["my approach", "about me", "what i can help with"]);

/**
 * A profile's sections, languages included and special interests folded in, split into those read at length and the
 * short rest, each in UKCP's order. Going by heading rather than length keeps a section in the same place on every
 * profile; an unknown heading is short.
 */
export function sectionsBySize(profile: Profile): { long: ShownSection[]; short: ShownSection[] } {
  const languages: ShownSection[] = profile.languages.length > 0 ? [{ heading: "Languages", paragraphs: [], items: profile.languages, details: [] }] : [];
  const sections = withInterests([...profile.about, ...languages, ...profile.practical]);
  const isLong = (section: ShownSection) => LONG.has(section.heading.toLowerCase());
  return { long: sections.filter(isLong), short: sections.filter((section) => !isLong(section)) };
}
