import { describe, expect, it } from "vitest";
import type { TherapistCard } from "@shared/types";
import { isRemoteOnly, layoutPins, listEntries, lookupText, officeDistrict, pinLabel, type LookupResult, type Pin } from "./pins";

const card = (slug: string, extra: Partial<TherapistCard> = {}): TherapistCard => ({ slug, name: slug, initials: "T", tags: [], ...extra });
const BRIGHTON = { lat: 50.8225, lng: -0.1372 };
const found = (kind: "postcode" | "outcode" | "place", ...candidates: { lat: number; lng: number; type?: string }[]): LookupResult => ({
  ok: true,
  lookup: { found: true, kind, candidates },
});

describe("lookupText", () => {
  it("returns the canonical text to look up, or null when nothing could be placed", () => {
    expect(lookupText("Brighton bn3")).toBe("BRIGHTON BN3");
    expect(lookupText(" BN")).toBeNull();
    expect(lookupText(undefined)).toBeNull();
  });
});

describe("officeDistrict", () => {
  it("is the district of a card that gives no more than that, whose office's postcode the profile may give", () => {
    expect(officeDistrict("Brighton bn1")).toBe("BN1");
    expect(officeDistrict("LS1")).toBe("LS1");
  });

  it("is nothing for a card giving a full postcode, only a town, or nothing to place", () => {
    for (const location of ["BRIGHTON BN3 2FL", "BN31FG", "Brighton", "Brighton BN", undefined]) expect(officeDistrict(location)).toBeUndefined();
  });
});

describe("layoutPins", () => {
  const layout = (therapists: TherapistCard[], results: Record<string, LookupResult | undefined>, centre = BRIGHTON, distance = 10) =>
    layoutPins(therapists, (t) => results[t.slug], centre, distance);

  it("stacks therapists who share a point into one pin", () => {
    const bn3 = found("outcode", { lat: 50.835, lng: -0.178 });
    const { pins, unplaced } = layout([card("a"), card("b"), card("c")], { a: bn3, b: bn3, c: found("outcode", { lat: 50.83, lng: -0.13 }) });
    expect(pins.map((p) => p.therapists.map((t) => t.slug))).toEqual([["a", "b"], ["c"]]);
    expect(unplaced).toEqual([]);
  });

  it("keeps the office postcode that placed a therapist, where it was that rather than their card", () => {
    const office = { lat: 50.824, lng: -0.139 };
    const byOffice: LookupResult = { ok: true, lookup: { found: true, kind: "postcode", candidates: [office] }, office: "BN1 1EL" };
    const { pins } = layout([card("a"), card("b")], { a: byOffice, b: found("postcode", office) });
    expect(pins.map((p) => [p.therapists.map((t) => t.slug), p.offices])).toEqual([[["a", "b"], { a: "BN1 1EL" }]]);
  });

  it("leaves out therapists whose lookup is still loading", () => {
    expect(layout([card("a")], { a: undefined })).toEqual({ pins: [], unplaced: [] });
  });

  it("leaves unplaced those whose lookup failed, was too general or found nothing", () => {
    const { unplaced } = layout([card("a"), card("b"), card("c")], {
      a: { ok: false },
      b: { ok: true, lookup: { found: false, reason: "too-general" } },
      c: { ok: true, lookup: { found: false, reason: "not-found" } },
    });
    expect(unplaced.map((t) => t.slug)).toEqual(["a", "b", "c"]);
  });

  it("unplaces a place-name match implausibly far from the search, but not a postcode", () => {
    const leeds = { lat: 53.8, lng: -1.55 };
    const { pins, unplaced } = layout([card("a"), card("b")], { a: found("place", leeds), b: found("outcode", leeds) });
    expect(unplaced.map((t) => t.slug)).toEqual(["a"]);
    expect(pins.map((p) => p.therapists[0]?.slug)).toEqual(["b"]);
  });
});

describe("listEntries", () => {
  const pin = (key: string, ...therapists: TherapistCard[]): Pin => ({ key, point: BRIGHTON, therapists, kind: "outcode" });

  it("gathers a stacked pin's therapists where the first of them comes, leaving everyone else in order", () => {
    const [a, b, c, d, e] = ["a", "b", "c", "d", "e"].map((slug) => card(slug));
    const entries = listEntries([a!, b!, c!, d!, e!], [pin("x", a!, c!), pin("y", b!)]);
    const who = (entry: (typeof entries)[number]) => (entry.therapist ? [entry.therapist] : entry.pin.therapists).map((t) => t.slug);
    expect(entries.map((entry) => [entry.key, entry.pin?.key, who(entry)])).toEqual([
      ["x", "x", ["a", "c"]],
      ["b", "y", ["b"]],
      ["d", undefined, ["d"]],
      ["e", undefined, ["e"]],
    ]);
  });
});

describe("pinLabel", () => {
  const at = (kind: Pin["kind"], ...locations: string[]): Pin => ({
    key: "k",
    point: BRIGHTON,
    therapists: locations.map((location, i) => card(`t${i}`, { location })),
    kind,
  });

  it("gives the location everyone at the pin lists, as the first of them writes it", () => {
    expect(pinLabel(at("outcode", "LONDON E8", "London  e8 "))).toBe("LONDON E8");
  });

  it("names a pin by the office postcodes that placed those at it, not the districts their cards give", () => {
    const moved = { ...at("postcode", "Brighton BN1", "BN1", "BN1 1EL"), offices: { t0: "BN1 1EL", t1: "BN1 1EL" } };
    expect(pinLabel(moved)).toBe("BN1 1EL");
  });

  it("falls back to what placed the pin when they write it differently", () => {
    expect(pinLabel(at("outcode", "HACKNEY E8", "LONDON E8"))).toBe("E8");
    expect(pinLabel(at("postcode", "HOVE BN3 3AB", "BN3 3AB", "BRIGHTON BN3 3AD"))).toBe("BN3 3AB, BN3 3AD");
    expect(pinLabel(at("place", "Brighton  and Hove BN", "BRIGHTON AND HOVE"))).toBe("Brighton and Hove");
  });

  it("names the district or place a postcode fell back to, not the postcode", () => {
    expect(pinLabel(at("outcode", "LONDON E8 9ZZ", "HACKNEY E8"))).toBe("E8");
    expect(pinLabel(at("place", "Brighton XX1 1XX", "BRIGHTON"))).toBe("Brighton");
  });
});

describe("isRemoteOnly", () => {
  it("is true only when Remote is offered without In-person", () => {
    expect(isRemoteOnly(card("a", { sessionTypes: "Remote" }))).toBe(true);
    expect(isRemoteOnly(card("a", { sessionTypes: "In-person & Remote" }))).toBe(false);
    expect(isRemoteOnly(card("a", { sessionTypes: "In-person" }))).toBe(false);
    expect(isRemoteOnly(card("a"))).toBe(false);
  });
});
