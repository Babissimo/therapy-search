import type { Profile, ProfileSection } from "@shared/types";

/** Headings of the sections read at length, as UKCP spells them, compared without case. */
const LONG = new Set(["my approach", "about me", "special interests", "what i can help with"]);

/**
 * A profile's sections, languages included, split into those read at length and the short rest, each in UKCP's order.
 * Going by heading rather than length keeps a section in the same place on every profile; an unknown heading is short.
 */
export function sectionsBySize(profile: Profile): { long: ProfileSection[]; short: ProfileSection[] } {
  const languages: ProfileSection[] = profile.languages.length > 0 ? [{ heading: "Languages", paragraphs: [], items: profile.languages, details: [] }] : [];
  const sections = [...profile.about, ...languages, ...profile.practical];
  const isLong = (section: ProfileSection) => LONG.has(section.heading.toLowerCase());
  return { long: sections.filter(isLong), short: sections.filter((section) => !isLong(section)) };
}
