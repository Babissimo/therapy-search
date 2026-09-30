import { describe, expect, it } from "vitest";
import type { Profile, ProfileSection } from "@shared/types";
import { isInterestOf, withInterests } from "./interests";

const STOCK =
  "Like all UKCP registered psychotherapists and psychotherapeutic counsellors I can work with a wide range of issues, but here are some areas in which I have a special interest or additional experience.";
const prose = (heading: string): ProfileSection => ({ heading, paragraphs: ["Text"], items: [], details: [] });
const tags = (heading: string, items: string[]): ProfileSection => ({ heading, paragraphs: [], items, details: [] });
const interests = (details: ProfileSection["details"], paragraphs = [STOCK]): ProfileSection => ({ heading: "Special Interests", paragraphs, items: [], details });
const TRAUMA = { title: "Trauma", text: "Trauma text." };
const GENDER = { title: "Gender", text: "" };

describe("withInterests", () => {
  it("folds the special interests into what the therapist can help with, where that stands, listing each tag once", () => {
    const sections = [prose("About Me"), interests([TRAUMA, GENDER]), tags("Types of Therapies Offered", ["Gestalt Psychotherapist"]), tags("What I can help with", ["Anxiety", "trauma"])];
    expect(withInterests(sections)).toEqual([
      prose("About Me"),
      tags("Types of Therapies Offered", ["Gestalt Psychotherapist"]),
      { ...tags("What I can help with", ["Anxiety"]), interests: { paragraphs: [], details: [TRAUMA, GENDER] } },
    ]);
  });

  it("makes the special interests what the therapist can help with, in their own place, where there is no such list", () => {
    const sections = [prose("About Me"), interests([TRAUMA]), tags("Types of Therapies Offered", ["Gestalt Psychotherapist"])];
    expect(withInterests(sections)).toEqual([
      prose("About Me"),
      { ...tags("What I can help with", []), interests: { paragraphs: [], details: [TRAUMA] } },
      tags("Types of Therapies Offered", ["Gestalt Psychotherapist"]),
    ]);
  });

  it("keeps words the therapist wrote with their special interests, dropping only UKCP's own sentence", () => {
    const [section] = withInterests([interests([TRAUMA], [STOCK, "Mostly adults."]), tags("What I can help with", ["Anxiety"])]);
    expect(section?.paragraphs).toEqual([]);
    expect(section?.interests?.paragraphs).toEqual(["Mostly adults."]);
  });

  it("keeps the therapist's words that follow UKCP's sentence in the same paragraph", () => {
    const [section] = withInterests([interests([TRAUMA], [`${STOCK}\nMostly adults.`])]);
    expect(section?.interests?.paragraphs).toEqual(["Mostly adults."]);
  });

  it("leaves nothing of special interests that are UKCP's sentence alone", () => {
    expect(withInterests([prose("About Me"), interests([])])).toEqual([prose("About Me")]);
  });

  it("leaves a profile without special interests as it is", () => {
    const sections = [prose("About Me"), tags("What I can help with", ["Anxiety"])];
    expect(withInterests(sections)).toEqual(sections);
  });
});

describe("isInterestOf", () => {
  const PROFILE: Profile = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };

  it("knows the therapist's special interests whatever their case, wherever the profile lists them", () => {
    const isInterest = isInterestOf({ ...PROFILE, about: [tags("What I can help with", ["Anxiety"])], practical: [interests([TRAUMA, GENDER])] });
    expect(["trauma", "Gender", "Anxiety"].map(isInterest)).toEqual([true, true, false]);
  });

  it("knows none on a profile without special interests", () => {
    expect(isInterestOf(PROFILE)("Trauma")).toBe(false);
  });
});
