import { describe, expect, it } from "vitest";
import type { TherapistCard } from "@shared/types";
import { parseMiles, reachLine, reachMiles, resultCount } from "./reach";

const card = (slug: string, extra: Partial<TherapistCard> = {}): TherapistCard => ({ slug, name: slug, initials: "T", tags: [], ...extra });

describe("parseMiles", () => {
  it("reads the miles in a card's distance", () => {
    expect(parseMiles("0.6 miles from Brighton")).toBe(0.6);
    expect(parseMiles("1 mile from Hove")).toBe(1);
    expect(parseMiles("0 miles from Brighton")).toBe(0);
    expect(parseMiles(undefined)).toBeUndefined();
    expect(parseMiles("near Brighton")).toBeUndefined();
  });
});

describe("reachMiles", () => {
  it("takes the furthest of UKCP's distances among the loaded cards", () => {
    expect(reachMiles([card("a", { distance: "0.2 miles from Brighton" }), card("b"), card("c", { distance: "1.4 miles from Brighton" })])).toBe(1.4);
    expect(reachMiles([card("a"), card("b")])).toBeUndefined();
    expect(reachMiles([])).toBeUndefined();
  });
});

describe("reachLine", () => {
  const near = [card("a", { distance: "0.2 miles from Brighton" }), card("b", { distance: "0.6 miles from Brighton" })];

  it("says how far a location search has reached", () => {
    expect(reachLine(near, 257, true)).toBe("Nearest 2 of 257, up to 0.6 miles away");
    expect(reachLine([card("a", { distance: "1 mile from Hove" })], 9, true)).toBe("Nearest 1 of 9, up to 1 mile away");
    expect(reachLine([card("a")], 9, true)).toBe("Nearest 1 of 9");
  });

  it("counts plainly without a location, and says when there is nothing", () => {
    expect(reachLine(near, 257, false)).toBe("2 of 257");
    expect(reachLine([], 0, true)).toBe("No results");
  });
});

describe("resultCount", () => {
  it("counts a search's results", () => {
    expect([undefined, 0, 1, 257].map((total) => resultCount(total))).toEqual(["Results", "No results", "1 result", "257 results"]);
  });
});
