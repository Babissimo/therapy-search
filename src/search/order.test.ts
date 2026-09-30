// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { inOrder, rank, storedSeed } from "./order";

function memory(initial?: string) {
  const store = new Map<string, string>(initial === undefined ? [] : [["order-seed", initial]]);
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    store,
  };
}

const slugs = (listings: { slug: string }[]) => listings.map((l) => l.slug);
const people = Array.from({ length: 40 }, (_, i) => ({ slug: `Therapist-${i}-ID${1000 + i}` }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("storedSeed", () => {
  it("keeps the seed it finds", () => {
    expect(storedSeed(memory("4294967295"))).toBe(4294967295);
  });

  it("draws a seed and stores it when there is none, or none it can use", () => {
    for (const stored of [undefined, "", "-1", "4294967296", "1.5", "seed"]) {
      const storage = memory(stored);
      const seed = storedSeed(storage);
      expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff).toBe(true);
      expect(storage.store.get("order-seed")).toBe(String(seed));
    }
  });

  it("still draws a seed when storage refuses reads or writes, or is out of reach", () => {
    const refuse = () => {
      throw new Error("refused");
    };
    expect(storedSeed({ ...memory(), setItem: refuse })).toBeTypeOf("number");
    expect(storedSeed({ ...memory("7"), getItem: refuse })).toBeTypeOf("number");
    expect(storedSeed(null)).toBeTypeOf("number");
  });
});

describe("orderSeed", () => {
  it("keeps one seed in the browser's storage", async () => {
    const { orderSeed } = await import("./order");
    expect(orderSeed()).toBe(orderSeed());
    expect(localStorage.getItem("order-seed")).toBe(String(orderSeed()));
  });

  it("keeps one seed for the page load when storage is out of reach", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const { orderSeed } = await import("./order");
    expect(orderSeed()).toBe(orderSeed());
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
    const at = (miles: string) => people.slice(0, 10).map((p) => ({ slug: `${p.slug}-${miles}`, distance: `${miles} miles from Leeds` }));
    const ordered = inOrder([...at("1.2"), ...at("0.3"), ...at("0"), ...at("1")].reverse(), 7);
    expect(ordered.map((l) => l.distance)).toEqual(["0", "0.3", "1", "1.2"].flatMap((miles) => Array(10).fill(`${miles} miles from Leeds`)));
    expect(slugs(ordered.slice(0, 10))).toEqual(slugs(inOrder(at("0"), 7)));
  });

  it("counts a card without a distance as 0 miles, among the nearest, as UKCP does", () => {
    const online = people.slice(0, 10).map((p) => ({ slug: `${p.slug}-online` }));
    const near = people.slice(10, 20).map((p) => ({ slug: p.slug, distance: "0 miles from Leeds" }));
    const ordered = inOrder([{ slug: "Far-ID1", distance: "0.1 miles from Leeds" }, ...near, ...online], 7);
    expect(slugs(ordered)).toEqual([...slugs(inOrder([...online, ...near], 7)), "Far-ID1"]);
  });
});
