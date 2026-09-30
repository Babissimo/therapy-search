import type { Profile, ProfileSection } from "@shared/types";

/** A section as the profile shows it: What I can help with also carries the special interests, which it lists first. */
export type ShownSection = ProfileSection & { interests?: Pick<ProfileSection, "paragraphs" | "details"> };

// UKCP's headings, compared without case.
const INTERESTS = "special interests";
const HELP = "what i can help with";

// UKCP's own sentence above every therapist's special interests, up to its full stop; the group's heading says as much.
const STOCK = /^like all ukcp registered psychotherapists and psychotherapeutic counsellors\b[^.]*\.\s*/i;

const headed = (heading: string) => (section: ProfileSection) => section.heading.toLowerCase() === heading;

/**
 * The sections with the special interests folded into What I can help with, where that stands or else where they did.
 * Most interests are on the help list too, and each tag is listed once, under the interests.
 */
export function withInterests(sections: ProfileSection[]): ShownSection[] {
  const interests = sections.find(headed(INTERESTS));
  if (!interests) return sections;
  const help = sections.find(headed(HELP));
  const titles = new Set(interests.details.map((detail) => detail.title.toLowerCase()));
  const own = { paragraphs: interests.paragraphs.map((text) => text.replace(STOCK, "")).filter(Boolean), details: interests.details };
  const merged: ShownSection = {
    heading: help?.heading ?? "What I can help with",
    paragraphs: help?.paragraphs ?? [],
    items: (help?.items ?? []).filter((item) => !titles.has(item.toLowerCase())),
    details: help?.details ?? [],
    interests: own,
  };
  const isEmpty = [merged.paragraphs, merged.items, merged.details, own.paragraphs, own.details].every((list) => list.length === 0);
  const place = help ?? interests;
  return sections.flatMap((section) => {
    if (section === place) return isEmpty ? [] : [merged];
    return section === interests || section === help ? [] : [section];
  });
}

/** Whether a tag is one of the therapist's special interests, whatever its case. */
export function isInterestOf(profile: Profile): (tag: string) => boolean {
  const interests = [...profile.about, ...profile.practical].find(headed(INTERESTS));
  const titles = new Set(interests?.details.map((detail) => detail.title.toLowerCase()));
  return (tag) => titles.has(tag.toLowerCase());
}
