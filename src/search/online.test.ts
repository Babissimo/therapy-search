import { describe, expect, it } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import { narrowsOnline, nearMeParams, onlineParams, onlineSearch, rememberPlace } from "./online";
import { withFlag, withMulti, withText } from "./state";

const sessions = (...values: string[]): SearchParams => values.reduce((p, v) => withMulti(p, "TypesOfSession", v, true), emptyParams());
const inLeeds = withFlag(withText(withMulti(sessions("Online Therapy", "Home Visits"), "Languages", "Greek", true), "Location", "Leeds"), "LocationSearchOutsideUK", true);

describe("onlineParams", () => {
  it("leaves the place behind and keeps the other filters", () => {
    const online = onlineParams(inLeeds);
    expect(online.text.Location).toBe("");
    expect(online.flags.LocationSearchOutsideUK).toBe(false);
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
    expect(onlineSearch(inLeeds).text.Location).toBe("");
  });
});

describe("narrowsOnline", () => {
  it("wants a filter besides the session types, which alone leave thousands", () => {
    expect(narrowsOnline(emptyParams())).toBe(false);
    expect(narrowsOnline(sessions("Online Therapy", "Telephone Therapy"))).toBe(false);
    expect(narrowsOnline(withMulti(emptyParams(), "Languages", "Greek", true))).toBe(true);
    expect(narrowsOnline(withText(emptyParams(), "KeywordFilter", "grief"))).toBe(true);
    expect(narrowsOnline(withFlag(emptyParams(), "OnlyProfilesWithPhotos", true))).toBe(true);
  });

  it("takes neither a place nor a session type needing one as a filter", () => {
    expect(narrowsOnline(withFlag(withText(sessions("Home Visits"), "Location", "Leeds"), "LocationSearchOutsideUK", true))).toBe(false);
  });
});

describe("nearMeParams", () => {
  it("searches the place last left for online again, with the filters chosen since", () => {
    rememberPlace(inLeeds);
    const near = nearMeParams(withMulti(onlineParams(inLeeds), "Languages", "French", true));
    expect(near.text.Location).toBe("Leeds");
    expect(near.flags.LocationSearchOutsideUK).toBe(true);
    expect(near.multi.Languages).toEqual(["Greek", "French"]);
    expect(near.multi.TypesOfSession).toEqual(["Online Therapy"]);
  });

  it("forgets the place once online is reached from a search without one", () => {
    rememberPlace(inLeeds);
    rememberPlace(emptyParams());
    expect(nearMeParams(emptyParams()).text.Location).toBe("");
  });
});
