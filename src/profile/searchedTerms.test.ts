import { describe, expect, it } from "vitest";
import type { Profile } from "@shared/types";
import { matchingTags } from "./searchedTerms";

describe("matchingTags", () => {
  const section = (items: string[], titles: string[] = []) => ({ heading: "", paragraphs: [], items, details: titles.map((title) => ({ title, text: "" })) });
  const profile: Profile = {
    slug: "Jo-ABCDEFGH",
    name: "Jo Bloggs",
    initials: "JB",
    languages: ["French"],
    emailInContact: false,
    social: [],
    about: [section(["Couples"], ["Anxiety"]), section(["anxiety", "Depression"])],
    practical: [section(["Online Therapy"])],
    offices: [],
  };

  it("lists each searched tag once, in the profile's order, languages last", () => {
    const searched = new Set(["anxiety", "online therapy", "couples", "french"]);
    expect(matchingTags(profile, (tag) => searched.has(tag.toLowerCase()))).toEqual(["Couples", "Anxiety", "Online Therapy", "French"]);
  });
});
