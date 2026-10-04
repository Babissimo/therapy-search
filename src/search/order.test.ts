// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { inOrder, settled, storedSeed } from "./order";

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
