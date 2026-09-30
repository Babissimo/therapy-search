import { describe, expect, it } from "vitest";
import type { FilterGroup } from "@shared/types";
import { filterGroups, onlineFilterGroups } from "./filterGroups";

const photos = { name: "OnlyProfilesWithPhotos", value: "true", label: "Only show profiles with photos" };
const wheelchair = { name: "OnlyWheelchairAccessible", value: "true", label: "Only show wheelchair accessible" };
const languages: FilterGroup = { label: "Languages", fields: [{ name: "Languages", value: "French", label: "French" }] };
const session = (value: string) => ({ name: "TypesOfSession", value, label: value });
const sessions: FilterGroup = { label: "Type of Session", fields: [session("Face to Face - Long Term"), session("Online Therapy"), session("Telephone Therapy")] };

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

describe("onlineFilterGroups", () => {
  const additional: FilterGroup = { label: "Additional Filters", help: "Photos and wheelchair access.", fields: [photos, wheelchair] };
  const groups = onlineFilterGroups({ helpWith: [], groups: [sessions, languages, additional] });

  it("offers only the session types that can be had remotely", () => {
    expect(groups[0]?.fields.map((f) => f.value)).toEqual(["Online Therapy", "Telephone Therapy"]);
    expect(groups[1]).toBe(languages);
  });

  it("leaves out the outside-UK tick, as there is no place to read, and wheelchair access, as there are no premises", () => {
    expect(groups[2]?.fields.map((f) => f.name)).toEqual(["OnlyProfilesWithPhotos"]);
    expect(groups[2]?.help).not.toMatch(/wheelchair/i);
  });
});
