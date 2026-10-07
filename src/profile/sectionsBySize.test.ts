import { describe, expect, it } from "vitest";
import type { Profile } from "@shared/types";
import { sectionsBySize } from "./sectionsBySize";

const section = (heading: string) => ({ heading, paragraphs: ["Text"], items: [], details: [] });
const PROFILE: Profile = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };
const headings = (sections: { heading: string }[]) => sections.map((s) => s.heading);

describe("sectionsBySize", () => {
  it("puts About Me first of the sections read at length, and who, how and in what language before the offices, the rest after", () => {
    const { long, beforeOffices, afterOffices } = sectionsBySize({
      ...PROFILE,
      languages: ["French"],
      about: ["My Approach", "About Me", "I work with", "Special Interests", "Types of Therapies Offered", "What I can help with"].map(section),
      practical: ["Types of sessions", "UKCP College", "Working with Children"].map(section),
    });
    expect(headings(long)).toEqual(["About Me", "My Approach", "What I can help with"]);
    expect(headings(beforeOffices)).toEqual(["I work with", "Types of sessions", "Languages"]);
    expect(headings(afterOffices)).toEqual(["Types of Therapies Offered", "UKCP College", "Working with Children"]);
  });

  it("knows a heading whatever its case, and puts one it doesn't know after the offices in UKCP's order", () => {
    const { long, beforeOffices, afterOffices } = sectionsBySize({
      ...PROFILE,
      about: [section("Qualifications"), section("ABOUT ME"), section("types of sessions")],
      practical: [section("UKCP College"), section("Insurance")],
    });
    expect(headings(long)).toEqual(["ABOUT ME"]);
    expect(headings(beforeOffices)).toEqual(["types of sessions"]);
    expect(headings(afterOffices)).toEqual(["Qualifications", "UKCP College", "Insurance"]);
  });

  it("has no languages section for a profile without languages", () => {
    expect(sectionsBySize(PROFILE)).toEqual({ long: [], beforeOffices: [], afterOffices: [] });
  });
});
