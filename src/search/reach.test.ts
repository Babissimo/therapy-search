import { describe, expect, it } from "vitest";
import { emptyParams } from "@shared/query";
import type { SearchResult, TherapistCard } from "@shared/types";
import { reachMiles, resultCount, resultsHeading, resultsWhere } from "./reach";
import { withText } from "./state";

const card = (slug: string, extra: Partial<TherapistCard> = {}): TherapistCard => ({ slug, name: slug, initials: "T", tags: [], ...extra });

describe("reachMiles", () => {
  it("takes the furthest of UKCP's distances among the loaded cards", () => {
    expect(reachMiles([card("a", { distance: "0.2 miles from Brighton" }), card("b"), card("c", { distance: "1.4 miles from Brighton" })])).toBe(1.4);
    expect(reachMiles([card("a"), card("b")])).toBeUndefined();
    expect(reachMiles([])).toBeUndefined();
  });
});

describe("resultsHeading", () => {
  const near = [card("a", { distance: "0.2 miles from Brighton" }), card("b", { distance: "0.6 miles from Brighton" })];

  it("counts what a location search has loaded and how far out it reaches", () => {
    expect(resultsHeading(near, 257, true)).toBe("2 results within 0.6 miles");
    expect(resultsHeading([card("a", { distance: "1 mile from Hove" })], 9, true)).toBe("1 result within 1 mile");
    expect(resultsHeading([card("a", { distance: "0 miles from Hove" })], 9, true)).toBe("1 result within 0.1 miles");
    expect(resultsHeading([card("a")], 9, true)).toBe("1 result");
    expect(resultsHeading([], 0, true)).toBe("No results within your area");
  });

  it("counts the whole search without a location", () => {
    expect(resultsHeading(near, 257, false)).toBe("257 results");
    expect(resultsHeading([], undefined, true)).toBe("Results");
  });
});

describe("resultCount", () => {
  it("counts a search's results", () => {
    expect([undefined, 0, 1, 257].map((total) => resultCount(total))).toEqual(["Results", "No results", "1 result", "257 results"]);
  });
});

describe("resultsWhere", () => {
  const leeds = withText(emptyParams(), "Location", "Leeds");
  const first = (total: number, locationSearched?: string): SearchResult => ({ total, from: 1, to: total, notices: [], therapists: [], locationSearched });
  const near = [card("a", { distance: "0.2 miles from Leeds" }), card("b", { distance: "0.6 miles from Leeds" })];

  it("names how far out a searched place's loaded cards reach, by the place's first name", () => {
    expect(resultsWhere(leeds, { first: first(9, "Leeds, West Yorkshire, UK"), therapists: near, searchedPlace: "Leeds, West Yorkshire, UK" }, false)).toBe(
      " within 0.6 miles of Leeds",
    );
  });

  it("says near the place typed when no distance or count says how far", () => {
    expect(resultsWhere(leeds, { first: first(2), therapists: [card("a"), card("b")] }, false)).toBe(" near Leeds");
    expect(resultsWhere(leeds, { first: first(0, "Leeds"), therapists: [], searchedPlace: "Leeds" }, false)).toBe(" near Leeds");
  });

  it("says across the UK when UKCP didn't know the place", () => {
    expect(resultsWhere(withText(emptyParams(), "Location", "Leedz"), { first: first(3, "United Kingdom"), therapists: near }, false)).toBe(" across the UK");
  });

  it("says online or by phone for the online list, and nothing with nowhere to name", () => {
    expect(resultsWhere(emptyParams(), { first: first(3), therapists: near }, true)).toBe(" working online or by phone");
    expect(resultsWhere(emptyParams(), { first: first(3), therapists: near }, false)).toBe("");
  });
});
