import { describe, expect, it } from "vitest";
import type { Profile } from "@shared/types";
import { sessionTypesOf } from "./sessions";

const profile = (heading: string, items: string[]): Profile => ({
  slug: "Test-ABCDEFGH",
  name: "Test Therapist",
  initials: "TT",
  languages: [],
  emailInContact: false,
  social: [],
  about: [],
  practical: [{ heading, paragraphs: [], items, details: [] }],
  offices: [],
});

describe("sessionTypesOf", () => {
  it("says how the therapist meets as UKCP's card would, from the types of sessions on their profile", () => {
    expect(sessionTypesOf(profile("Types of sessions", ["Face to Face - Long Term", "Face to Face - Short Term", "Online Therapy", "Telephone Therapy"]))).toBe(
      "In-person & Remote",
    );
    expect(sessionTypesOf(profile("Types of sessions", ["Face to Face - Short Term", "Home Visits"]))).toBe("In-person");
    expect(sessionTypesOf(profile("Types of sessions", ["Home Visits"]))).toBe("In-person");
    expect(sessionTypesOf(profile("TYPES OF SESSIONS", ["Telephone Therapy"]))).toBe("Remote");
  });

  it("says nothing where the profile lists no type it knows", () => {
    expect(sessionTypesOf(profile("Types of sessions", []))).toBeUndefined();
    expect(sessionTypesOf(profile("Types of sessions", ["Walk and Talk"]))).toBeUndefined();
    expect(sessionTypesOf(profile("UKCP College", ["Online Therapy"]))).toBeUndefined();
  });
});
