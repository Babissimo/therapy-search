import { describe, expect, it } from "vitest";
import type { FilterGroup } from "@shared/types";
import { filterGroups } from "./filterGroups";

const photos = { name: "OnlyProfilesWithPhotos", value: "true", label: "Only show profiles with photos" };
const languages: FilterGroup = { label: "Languages", fields: [{ name: "Languages", value: "French", label: "French" }] };

describe("filterGroups", () => {
  it("adds the outside-UK tick, and a word on it, to the end of the additional filters", () => {
    const groups = filterGroups({ helpWith: [], groups: [languages, { label: "Additional Filters", help: "Photos and access.", fields: [photos] }] });
    expect(groups[0]).toBe(languages);
    expect(groups[1]?.fields.map((f) => f.name)).toEqual(["OnlyProfilesWithPhotos", "LocationSearchOutsideUK"]);
    expect(groups[1]?.help).toMatch(/^Photos and access\. Searching locations outside the UK/);
  });

  it("keeps the tick in a group of its own if UKCP's options lose the additional filters", () => {
    const groups = filterGroups({ helpWith: [], groups: [languages] });
    expect(groups.map((g) => g.label)).toEqual(["Languages", "Additional Filters"]);
    expect(groups[1]?.fields.map((f) => f.name)).toEqual(["LocationSearchOutsideUK"]);
  });
});
