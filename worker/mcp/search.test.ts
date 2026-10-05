import { describe, expect, it } from "vitest";
import { ALLOWED } from "../../shared/options";
import { TEXT_MAX_LENGTH } from "../../shared/query";
import { HELP_NOW } from "./instructions";
import { LAST_PAGE, LISTS, searchDefinition } from "./search";

type Property = { type: string; items?: { enum: string[] }; description?: string; maximum?: number; maxLength?: number };
const schema = () => searchDefinition().inputSchema as { properties: Record<string, Property>; additionalProperties: boolean };

describe("search_therapists's definition", () => {
  it("offers each list's values as UKCP's form does, and no other argument", () => {
    const { properties, additionalProperties } = schema();
    for (const [arg, param] of Object.entries(LISTS)) {
      expect(properties[arg]?.items?.enum).toEqual([...ALLOWED[param]]);
      expect(properties[arg]?.items?.enum.length).toBeGreaterThan(0);
    }
    expect(Object.keys(properties)).toEqual(["location", "issues", "session_types", "works_with", "therapy_types", "languages", "wheelchair_accessible", "page"]);
    expect(additionalProperties).toBe(false);
  });

  it("says which lists narrow the search and which list widens it", () => {
    const { properties } = schema();
    for (const arg of ["issues", "works_with", "therapy_types", "languages"]) expect(properties[arg]?.description).toContain("narrows the list");
    expect(properties.session_types?.description).toContain("any one given");
  });

  it("bounds the place as the site does, and the pages to UKCP's nearest 48", () => {
    const { properties } = schema();
    expect(properties.location?.maxLength).toBe(TEXT_MAX_LENGTH);
    expect(properties.page?.maximum).toBe(LAST_PAGE);
  });

  it("is read-only, and says where to turn for help now", () => {
    const definition = searchDefinition();
    expect(definition.annotations).toEqual({ readOnlyHint: true, openWorldHint: true });
    expect(definition.description).toContain(HELP_NOW);
  });
});
