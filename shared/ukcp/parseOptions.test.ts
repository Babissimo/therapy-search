// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { MULTI_PARAMS } from "../../shared/query";
import { fixture } from "./__fixtures__";
import { parseOptions } from "./parseOptions";
import { ParseError } from "./text";

describe("parseOptions", () => {
  const options = parseOptions(fixture("search-form.html"));

  it("reads the typeahead's terms", () => {
    expect(options.helpWith.length).toBeGreaterThan(50);
    expect(options.helpWith).toContain("Anxiety");
  });

  it("reads every filter group with its help note", () => {
    const names = new Set(options.groups.flatMap((g) => g.fields.map((f) => f.name)));
    for (const name of MULTI_PARAMS) expect(names).toContain(name);
    expect(names).toContain("OnlyProfilesWithPhotos");
    expect(options.groups.every((g) => g.label !== "" && g.help !== undefined)).toBe(true);
  });

  it("pairs each checkbox's value with its visible label", () => {
    const session = options.groups.find((g) => g.fields[0]?.name === "TypesOfSession");
    expect(session?.fields).toContainEqual({ name: "TypesOfSession", value: "Online Therapy", label: "Online Therapy" });
    expect(options.groups.flatMap((g) => g.fields).filter((f) => f.label === "")).toEqual([]);
  });

  it("fails loudly on a help-with term with a comma, which HelpWith could not carry", () => {
    const form = `<form id="FindATherapistSearch"><div class="find-a-therapist-issues-container"><ul><li>Loss, grief</li></ul></div>
<div class="fat-filters"><h3>Languages</h3><div><input type="checkbox" id="l1" name="Languages" value="Welsh"><label for="l1">Welsh</label></div></div></form>`;
    expect(() => parseOptions(form)).toThrow(ParseError);
  });

  it("fails loudly when the form is missing", () => {
    expect(() => parseOptions("<p>No form</p>")).toThrow(ParseError);
  });
});
