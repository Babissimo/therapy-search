import { describe, expect, it } from "vitest";
import { canonicalLocation, classifyLocation, placeQuery, settlementRank } from "./location";

describe("canonicalLocation", () => {
  it("trims, collapses spaces and upper-cases", () => {
    expect(canonicalLocation("  brighton   bn3 ")).toBe("BRIGHTON BN3");
  });
});

describe("classifyLocation", () => {
  // Strings as they appeared on live UKCP result cards on 2026-09-27, plus edge cases.
  it.each([
    [" BN31FG", { kind: "postcode", postcode: "BN3 1FG", outcode: "BN3", rest: "" }],
    ["Brighton BN3 1FG", { kind: "postcode", postcode: "BN3 1FG", outcode: "BN3", rest: "BRIGHTON" }],
    ["SW1A1AA", { kind: "postcode", postcode: "SW1A 1AA", outcode: "SW1A", rest: "" }],
    ["BRIGHTON BN3", { kind: "outcode", outcode: "BN3", rest: "BRIGHTON" }],
    ["Lewes BN7", { kind: "outcode", outcode: "BN7", rest: "LEWES" }],
    [" BN1", { kind: "outcode", outcode: "BN1", rest: "" }],
    ["London EC1V", { kind: "outcode", outcode: "EC1V", rest: "LONDON" }],
    ["Hove BN3, UK", { kind: "outcode", outcode: "BN3", rest: "HOVE" }],
    ["Leeds LS6, United Kingdom", { kind: "outcode", outcode: "LS6", rest: "LEEDS" }],
    ["Hove BN3, UK.", { kind: "outcode", outcode: "BN3", rest: "HOVE" }],
    ["Brighton BN3 1FG, UK", { kind: "postcode", postcode: "BN3 1FG", outcode: "BN3", rest: "BRIGHTON" }],
    ["Brighton, Brighton and Hove, UK", { kind: "place", name: "BRIGHTON, BRIGHTON AND HOVE," }],
    ["Brighton ", { kind: "place", name: "BRIGHTON" }],
    ["Brighton BN", { kind: "place", name: "BRIGHTON" }],
    ["St Albans", { kind: "place", name: "ST ALBANS" }],
    [" BN", { kind: "too-general" }],
    ["", { kind: "too-general" }],
  ])("reads %j", (text, expected) => {
    expect(classifyLocation(text)).toEqual(expected);
  });
});

describe("placeQuery", () => {
  it("builds one query string per lookup, flags only when set", () => {
    expect(placeQuery(" Brighton  bn3")).toBe("q=BRIGHTON+BN3");
    expect(placeQuery("Paris", { centre: true, outsideUK: true })).toBe("q=PARIS&centre=true&outsideUK=true");
    expect(placeQuery("Leeds", { centre: false, outsideUK: false })).toBe("q=LEEDS");
  });
});

describe("settlementRank", () => {
  it("puts bigger places first and unknown types last", () => {
    const ranks = ["city", "town", "other settlement", "suburban area", "village", "hamlet", undefined].map(settlementRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(settlementRank("suburb")).toBe(settlementRank("suburban area"));
    expect(settlementRank("peak")).toBe(settlementRank(undefined));
  });
});
