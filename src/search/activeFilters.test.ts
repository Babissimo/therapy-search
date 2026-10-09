import { describe, expect, it } from "vitest";
import { emptyParams } from "@shared/query";
import { activeFilters, soughtTerms } from "./activeFilters";
import { withField, withHelpWithTerms, withText } from "./state";

const french = { name: "Languages", value: "French", label: "French" };
const photos = { name: "OnlyProfilesWithPhotos", value: "true", label: "Only show profiles with photos" };
const options = {
  helpWith: ["Anxiety", "Trauma"],
  groups: [
    { label: "Languages", fields: [french] },
    { label: "Additional Filters", fields: [photos] },
  ],
};

describe("activeFilters", () => {
  it("is empty for a bare search, however it is placed", () => {
    expect(activeFilters(withText(emptyParams(), "Location", "Leeds"), options)).toEqual([]);
  });

  it("lists HelpWith terms, ticked boxes and the keyword in that order", () => {
    let params = withField(withField(emptyParams(), photos, true), french, true);
    params = withText(withHelpWithTerms(params, ["Trauma"]), "KeywordFilter", "grief");
    expect(activeFilters(params, options).map((f) => f.label)).toEqual(["Trauma", "French", "Only show profiles with photos", "Keyword: grief"]);
  });

  it("gives each filter the search without it", () => {
    const params = withField(withHelpWithTerms(emptyParams(), ["Anxiety", "Trauma"]), french, true);
    const [anxiety, , language] = activeFilters(params, options);
    expect(anxiety?.without.text.HelpWith).toBe("Trauma");
    expect(language?.without.multi.Languages).toEqual([]);
    expect(language?.without.text.HelpWith).toBe("Anxiety, Trauma");
  });

  it("shares one chip between a HelpWith term and the ticked box of the same name", () => {
    const anxiety = { name: "HelpWithAdvanced", value: "Anxiety", label: "Anxiety" };
    const withIssues = { ...options, groups: [...options.groups, { label: "I Want Help With", fields: [anxiety] }] };
    const params = withField(withHelpWithTerms(emptyParams(), ["Anxiety"]), anxiety, true);
    const filters = activeFilters(params, withIssues);
    expect(filters.map((f) => f.label)).toEqual(["Anxiety"]);
    expect(filters[0]?.without.text.HelpWith).toBe("");
    expect(filters[0]?.without.multi.HelpWithAdvanced).toEqual([]);
  });

  it("marks the help-with topics, typed or ticked, apart from the other filters", () => {
    const anxiety = { name: "HelpWithAdvanced", value: "Anxiety", label: "Anxiety" };
    const withIssues = { ...options, groups: [{ label: "I Want Help With", fields: [anxiety] }, ...options.groups] };
    let params = withField(withField(withHelpWithTerms(emptyParams(), ["Trauma"]), anxiety, true), french, true);
    params = withText(params, "KeywordFilter", "grief");
    expect(activeFilters(params, withIssues).map((f) => [f.label, f.topic])).toEqual([
      ["Trauma", true],
      ["Anxiety", true],
      ["French", false],
      ["Keyword: grief", false],
    ]);
  });
});

describe("soughtTerms", () => {
  it("gathers HelpWith terms, ticked boxes and the keyword, lower-cased", () => {
    let params = withField(withHelpWithTerms(withText(emptyParams(), "Location", "Leeds"), ["Trauma"]), french, true);
    params = withText(params, "KeywordFilter", "EMDR");
    expect([...soughtTerms(params, options)]).toEqual(["trauma", "french", "emdr"]);
  });

  it("is empty for a bare search", () => {
    expect(soughtTerms(withText(emptyParams(), "Location", "Leeds"), options).size).toBe(0);
  });
});
