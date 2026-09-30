import { describe, expect, it } from "vitest";
import { OTHER, SECTIONS, sectionDrift, sectionsOf } from "./sections";

const field = (value: string) => ({ name: "TypesOfTherapy", value, label: value });
const group = { label: "Type of Therapy", fields: ["Child Counsellor", "Gestalt Psychotherapist", "Psychoanalyst", "Adolescent Counsellor"].map(field) };
const sections = {
  TypesOfTherapy: [
    { heading: "Children", values: ["Adolescent Counsellor", "Child Counsellor"] },
    { heading: "Humanistic", about: "Warm and collaborative.", values: ["Gestalt Psychotherapist", "Withdrawn Title"] },
    { heading: "Empty", values: ["Also Withdrawn"] },
  ],
};

describe("sectionsOf", () => {
  it("puts boxes under their headings in UKCP's order, with unplaced ones last under Other", () => {
    expect(sectionsOf(group, sections)).toEqual([
      { heading: "Children", fields: [field("Child Counsellor"), field("Adolescent Counsellor")] },
      { heading: "Humanistic", about: "Warm and collaborative.", fields: [field("Gestalt Psychotherapist")] },
      { heading: OTHER, fields: [field("Psychoanalyst")] },
    ]);
  });

  it("leaves groups without headings as a flat list", () => {
    const languages = { label: "Languages", fields: [{ name: "Languages", value: "French", label: "French" }] };
    expect(sectionsOf(languages, sections)).toBeUndefined();
  });
});

describe("SECTIONS", () => {
  it("places each value under one heading only", () => {
    for (const defined of Object.values(SECTIONS)) {
      const values = defined.flatMap((s) => s.values);
      expect(values.length).toBe(new Set(values).size);
    }
  });

  it("says what each school of therapy is, as its titles alone rarely do", () => {
    expect(SECTIONS.TypesOfTherapy?.filter((s) => !s.about)).toEqual([]);
  });
});

describe("sectionDrift", () => {
  it("names options under Other and placed values UKCP no longer offers", () => {
    expect(sectionDrift({ helpWith: [], groups: [group] }, sections)).toEqual([
      "under Other TypesOfTherapy: Psychoanalyst",
      "no longer offered TypesOfTherapy: Withdrawn Title",
      "no longer offered TypesOfTherapy: Also Withdrawn",
    ]);
  });
});
