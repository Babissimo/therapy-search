import { describe, expect, it } from "vitest";
import { narrowsOnline, onlineParams, onlineSearch } from "./online";
import { emptyParams, type SearchParams } from "./query";

type Filters = { text?: Partial<SearchParams["text"]>; multi?: Partial<SearchParams["multi"]>; flags?: Partial<SearchParams["flags"]> };

function search({ text, multi, flags }: Filters = {}): SearchParams {
  const empty = emptyParams();
  return { ...empty, text: { ...empty.text, ...text }, multi: { ...empty.multi, ...multi }, flags: { ...empty.flags, ...flags } };
}

const sessions = (...values: string[]) => search({ multi: { TypesOfSession: values } });
const inLeeds = (flags: Filters["flags"] = {}) =>
  search({
    text: { Location: "Leeds" },
    multi: { TypesOfSession: ["Online Therapy", "Home Visits"], Languages: ["Greek"] },
    flags: { LocationSearchOutsideUK: true, ...flags },
  });

describe("onlineParams", () => {
  it("leaves the place and its premises behind and keeps the other filters", () => {
    const online = onlineParams(inLeeds({ OnlyWheelchairAccessible: true }));
    expect(online.text.Location).toBe("");
    expect(online.flags.LocationSearchOutsideUK).toBe(false);
    expect(online.flags.OnlyWheelchairAccessible).toBe(false);
    expect(online.multi.Languages).toEqual(["Greek"]);
  });

  it("keeps only the session types that can be had online", () => {
    expect(onlineParams(sessions("Face to Face - Long Term", "Telephone Therapy", "Home Visits")).multi.TypesOfSession).toEqual(["Telephone Therapy"]);
  });
});

describe("onlineSearch", () => {
  it("asks for therapists working online or by phone when neither is chosen", () => {
    expect(onlineSearch(emptyParams()).multi.TypesOfSession).toEqual(["Online Therapy", "Telephone Therapy"]);
  });

  it("asks only for the one chosen", () => {
    expect(onlineSearch(sessions("Telephone Therapy")).multi.TypesOfSession).toEqual(["Telephone Therapy"]);
  });

  it("asks for no place, even one a link carries", () => {
    expect(onlineSearch(inLeeds()).text.Location).toBe("");
  });
});

describe("narrowsOnline", () => {
  it("wants a filter besides the session types, which alone leave thousands", () => {
    expect(narrowsOnline(emptyParams())).toBe(false);
    expect(narrowsOnline(sessions("Online Therapy", "Telephone Therapy"))).toBe(false);
    expect(narrowsOnline(search({ multi: { Languages: ["Greek"] } }))).toBe(true);
    expect(narrowsOnline(search({ text: { KeywordFilter: "grief" } }))).toBe(true);
    expect(narrowsOnline(search({ flags: { OnlyProfilesWithPhotos: true } }))).toBe(true);
  });

  it("takes neither a place, wheelchair access nor a session type needing one as a filter", () => {
    const placed = search({ text: { Location: "Leeds" }, multi: { TypesOfSession: ["Home Visits"] }, flags: { LocationSearchOutsideUK: true, OnlyWheelchairAccessible: true } });
    expect(narrowsOnline(placed)).toBe(false);
  });
});
