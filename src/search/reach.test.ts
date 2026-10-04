import { describe, expect, it } from "vitest";
import type { TherapistCard } from "@shared/types";
import { reachMiles, resultCount, resultsHeading } from "./reach";

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
