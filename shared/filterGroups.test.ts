import { describe, expect, it } from "vitest";
import { OPTIONS } from "./options";
import type { FilterGroup } from "./types";
import { filterGroups, onlineFilterGroups } from "./filterGroups";

const UKCP_LABELS = new Set([...OPTIONS.groups.flatMap((g) => g.fields.map((f) => f.label)), "Search locations outside the UK"]);
const quotedIn = (help: string | undefined) => [...(help ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]!);

const photos = { name: "OnlyProfilesWithPhotos", value: "true", label: "Only show profiles with photos" };
const wheelchair = { name: "OnlyWheelchairAccessible", value: "true", label: "Only show wheelchair accessible" };
const languages: FilterGroup = { label: "Languages", help: "UKCP's words on languages.", fields: [{ name: "Languages", value: "French", label: "French" }] };
const session = (value: string) => ({ name: "TypesOfSession", value, label: value });
const sessions: FilterGroup = { label: "Type of Session", fields: [session("Face to Face - Long Term"), session("Online Therapy"), session("Telephone Therapy")] };
const added: FilterGroup = { label: "A Group UKCP Adds", help: "UKCP's words on it.", fields: [] };

describe("filterGroups", () => {
  it("adds the outside-UK tick, and a word on it, to the end of the additional filters", () => {
    const groups = filterGroups({ helpWith: [], groups: [languages, { label: "Additional Filters", help: "Photos and access.", fields: [photos] }] });
    expect(groups[0]?.fields).toBe(languages.fields);
    expect(groups[1]?.fields.map((f) => f.name)).toEqual(["OnlyProfilesWithPhotos", "LocationSearchOutsideUK"]);
    expect(groups[1]?.help).toMatch(/"Search locations outside the UK" looks for the place you type anywhere in the world\.$/);
  });

  it("keeps the tick in a group of its own if UKCP's options lose the additional filters", () => {
    const groups = filterGroups({ helpWith: [], groups: [languages] });
    expect(groups.map((g) => g.label)).toEqual(["Languages", "Additional Filters"]);
    expect(groups[1]?.fields.map((f) => f.name)).toEqual(["LocationSearchOutsideUK"]);
  });

  it("explains each of UKCP's groups in words of its own, and keeps UKCP's for a group it has none for yet", () => {
    const groups = filterGroups({ helpWith: [], groups: [languages, added] });
    expect(groups[0]?.help).toBe("Tick a language to find therapists who speak it. British Sign Language is here too.");
    expect(groups[1]).toBe(added);
    for (const group of [...filterGroups(OPTIONS), ...onlineFilterGroups(OPTIONS)]) {
      expect(group.help).not.toBe(OPTIONS.groups.find((g) => g.label === group.label)?.help);
    }
  });

  it("quotes only boxes UKCP still offers, and the group names the panel shows", () => {
    const groupNames = ["Type of therapy", "Type of session"];
    for (const group of [...filterGroups(OPTIONS), ...onlineFilterGroups(OPTIONS)]) {
      for (const quoted of quotedIn(group.help)) expect(UKCP_LABELS.has(quoted) || groupNames.includes(quoted), quoted).toBe(true);
    }
  });

  it("says what the session types' terms mean, and that any one ticked will do", () => {
    const help = filterGroups({ helpWith: [], groups: [sessions] })[0]?.help;
    expect(help).toContain("Therapists who offer any one you tick will show.");
    expect(help).toContain("Short term and long term");
  });
});

describe("onlineFilterGroups", () => {
  const additional: FilterGroup = { label: "Additional Filters", help: "Photos and wheelchair access.", fields: [photos, wheelchair] };
  const groups = onlineFilterGroups({ helpWith: [], groups: [sessions, languages, additional] });

  it("offers only the session types that can be had remotely, and speaks of those alone", () => {
    expect(groups[0]?.fields.map((f) => f.value)).toEqual(["Online Therapy", "Telephone Therapy"]);
    expect(groups[0]?.help).toMatch(/^Whether you'd like to meet online or by phone\./);
    expect(groups[1]?.fields).toBe(languages.fields);
  });

  it("leaves out the outside-UK tick, as there is no place to read, and wheelchair access, as there are no premises", () => {
    expect(groups[2]?.fields.map((f) => f.name)).toEqual(["OnlyProfilesWithPhotos"]);
    expect(groups[2]?.help).not.toMatch(/wheelchair/i);
  });
});
