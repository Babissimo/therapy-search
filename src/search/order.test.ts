// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { inOrder, rank, settled, storedSeed } from "./order";

function memory(initial?: string) {
  const store = new Map<string, string>(initial === undefined ? [] : [["order-seed", initial]]);
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    store,
  };
}

const slugs = (listings: { slug: string }[]) => listings.map((l) => l.slug);
const bare = { hasPhoto: false, hasSummary: false };
const people = Array.from({ length: 40 }, (_, i) => ({ slug: `Therapist-${i}-ID${1000 + i}`, ...bare }));

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
});

describe("settled", () => {
  const at = (miles: string | undefined, from: number) =>
    people.slice(from, from + 10).map((p, i) => ({ ...p, distance: miles && `${miles} miles from Leeds`, hasPhoto: i % 3 === 0, hasSummary: i % 2 === 0 }));
  const batch = [...at("1.2", 0), ...at("0.3", 10), ...at(undefined, 20).slice(0, 4), ...at("0", 24).slice(0, 6), ...at("1", 30)];
  // Nearest first, as UKCP sends them, but in another order among people at the same distance.
  const sent = inOrder(batch, 99);

  it("lists only the nearest few that the batch puts first, in the batch's order, however many were sent", () => {
    for (let n = 1; n < sent.length; n++) {
      const early = settled(sent.slice(0, n), false, 7);
      expect(slugs(early)).toEqual(slugs(inOrder(batch, 7).slice(0, early.length)));
    }
  });

  it("leaves out everyone at the furthest distance sent, who may share it with people not yet sent", () => {
    expect(settled(sent.slice(0, 15), false, 7).map((l) => l.distance ?? "none").sort()).toEqual([...Array(4).fill("none"), ...Array(6).fill("0 miles from Leeds")].sort());
    expect(settled(sent.slice(0, 10), false, 7)).toEqual([]);
  });

  it("lists everyone when UKCP sent all it found", () => {
    expect(slugs(settled(sent, true, 7))).toEqual(slugs(inOrder(batch, 7)));
  });
});
