import { describe, expect, it } from "vitest";
import { inOrder, newSeed, parseMiles, rank, readSeed } from "./order";

const slugs = (listings: { slug: string }[]) => listings.map((l) => l.slug);
const bare = { hasPhoto: false, hasSummary: false };
const people = Array.from({ length: 40 }, (_, i) => ({ slug: `Therapist-${i}-ID${1000 + i}`, ...bare }));

describe("parseMiles", () => {
  it("reads the miles in a card's distance", () => {
    expect(parseMiles("0.6 miles from Brighton")).toBe(0.6);
    expect(parseMiles("1 mile from Hove")).toBe(1);
    expect(parseMiles("0 miles from Brighton")).toBe(0);
    expect(parseMiles(undefined)).toBeUndefined();
    expect(parseMiles("near Brighton")).toBeUndefined();
  });
});

describe("readSeed", () => {
  it("reads a whole number from 0 to 2^32 - 1, and nothing else", () => {
    expect([readSeed("0"), readSeed("4294967295")]).toEqual([0, 4294967295]);
    for (const text of [undefined, null, "", "-1", "4294967296", "1.5", "1e3", "seed"]) expect(readSeed(text)).toBeUndefined();
  });

  it("reads back every seed newSeed draws", () => {
    for (let i = 0; i < 20; i++) {
      const seed = newSeed();
      expect(readSeed(String(seed))).toBe(seed);
    }
  });
});

describe("rank", () => {
  it("is 32-bit FNV-1a of the seed and slug, so an order holds from one release to the next", () => {
    expect(rank(1, "Jo-Bloggs-ABCDEFGH")).toBe(2585269825);
    expect(rank(4294967295, "a")).toBe(1517120011);
  });
});

describe("inOrder", () => {
  it("gives one order for one seed, whatever order UKCP answered in", () => {
    expect(slugs(inOrder([...people].reverse(), 7))).toEqual(slugs(inOrder(people, 7)));
  });

  it("gives another seed another order", () => {
    expect(slugs(inOrder(people, 8))).not.toEqual(slugs(inOrder(people, 7)));
  });

  it("keeps everyone else in place relative to each other when someone joins or leaves", () => {
    const ordered = slugs(inOrder(people, 7));
    const without = people.filter((p) => p.slug !== ordered[3]);
    expect(slugs(inOrder(without, 7))).toEqual(ordered.filter((slug) => slug !== ordered[3]));
  });

  it("keeps a location search nearest first, reordering only people at the same distance", () => {
    const at = (miles: string) => people.slice(0, 10).map((p) => ({ ...p, slug: `${p.slug}-${miles}`, distance: `${miles} miles from Leeds` }));
    const ordered = inOrder([...at("1.2"), ...at("0.3"), ...at("0"), ...at("1")].reverse(), 7);
    expect(ordered.map((l) => l.distance)).toEqual(["0", "0.3", "1", "1.2"].flatMap((miles) => Array(10).fill(`${miles} miles from Leeds`)));
    expect(slugs(ordered.slice(0, 10))).toEqual(slugs(inOrder(at("0"), 7)));
  });

  it("counts a card without a distance as 0 miles, among the nearest, as UKCP does", () => {
    const online = people.slice(0, 10).map((p) => ({ ...p, slug: `${p.slug}-online` }));
    const near = people.slice(10, 20).map((p) => ({ ...p, distance: "0 miles from Leeds" }));
    const ordered = inOrder([{ slug: "Far-ID1", distance: "0.1 miles from Leeds", ...bare }, ...near, ...online], 7);
    expect(slugs(ordered)).toEqual([...slugs(inOrder([...online, ...near], 7)), "Far-ID1"]);
  });

  it.each([
    ["at the same distance", "0.4 miles from Leeds"],
    ["in a search without a location", undefined],
  ])("puts people %s who show more first: a photo and a summary, then either, then neither", (_, distance) => {
    const showing = (hasPhoto: boolean, hasSummary: boolean) =>
      people.slice(0, 10).map((p) => ({ slug: `${p.slug}-${hasPhoto}-${hasSummary}`, distance, hasPhoto, hasSummary }));
    const [both, photo, summary, neither] = [showing(true, true), showing(true, false), showing(false, true), showing(false, false)];
    const ordered = slugs(inOrder([...neither, ...summary, ...photo, ...both], 7));
    expect(ordered).toEqual(slugs([...inOrder(both, 7), ...inOrder([...photo, ...summary], 7), ...inOrder(neither, 7)]));
  });

  it("keeps the nearest first however little they show", () => {
    const near = { slug: "Near-ID1", distance: "0.2 miles from Leeds", ...bare };
    const far = { slug: "Far-ID2", distance: "0.3 miles from Leeds", hasPhoto: true, hasSummary: true };
    expect(slugs(inOrder([far, near], 7))).toEqual(["Near-ID1", "Far-ID2"]);
  });

  it("counts a listing that says nothing of its photo or summary as showing neither", () => {
    const unsaid = people.map(({ slug }) => ({ slug, distance: "0.4 miles from Leeds" }));
    expect(slugs(inOrder(unsaid, 7))).toEqual(slugs(inOrder(people.map((p) => ({ ...p, distance: "0.4 miles from Leeds" })), 7)));
  });
});

