import { describe, expect, it } from "vitest";
import type { Profile } from "@shared/types";
import { sectionsBySize } from "./sectionsBySize";

const section = (heading: string) => ({ heading, paragraphs: ["Text"], items: [], details: [] });
const PROFILE: Profile = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };
const headings = (sections: { heading: string }[]) => sections.map((s) => s.heading);

describe("sectionsBySize", () => {
  it("puts the sections read at length in one list, About Me first, and the rest, languages among them, in the other in UKCP's order", () => {
    const { long, short } = sectionsBySize({
      ...PROFILE,
      languages: ["French"],
      about: ["My Approach", "About Me", "I work with", "Special Interests", "Types of Therapies Offered", "What I can help with"].map(section),
      practical: ["Types of sessions", "Working with Children", "UKCP College"].map(section),
    });
    expect(headings(long)).toEqual(["About Me", "My Approach", "What I can help with"]);
    expect(headings(short)).toEqual(["I work with", "Types of Therapies Offered", "Languages", "Types of sessions", "Working with Children", "UKCP College"]);
  });

  it("knows a heading whatever its case, and takes one it doesn't know as short", () => {
    const { long, short } = sectionsBySize({ ...PROFILE, about: [section("ABOUT ME"), section("Qualifications")] });
    expect(headings(long)).toEqual(["ABOUT ME"]);
    expect(headings(short)).toEqual(["Qualifications"]);
  });

  it("has no languages section for a profile without languages", () => {
    expect(sectionsBySize(PROFILE)).toEqual({ long: [], short: [] });
  });
});
