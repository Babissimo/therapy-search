import { describe, expect, it, vi } from "vitest";
import { batchFrom, moreIn, ready, streamsFrom, takeMerged, type Batch, type Stream } from "./merge";

const SEED = 7;
const at = (slug: string, miles: number) => ({ slug, distance: `${miles} miles from Leeds`, hasPhoto: false, hasSummary: false });
type Card = ReturnType<typeof at>;
const slugs = (cards: Card[]) => cards.map((card) => card.slug);
/** Streams with nothing loaded, which ask first for their first batch. */
const unloaded = (count: number): Stream<Card>[] => Array.from({ length: count }, () => ({ waiting: [], reach: 0, next: 1 }));

/** Batches of five from each of `searches`, keeping those `keep` lets through, as a search near a place sends them. */
function batches(searches: Card[][], keep: (card: Card) => boolean = () => true) {
  return vi.fn(async (stream: number, batch: number): Promise<Batch<Card>> => {
    const all = searches[stream]!;
    const sent = all.slice((batch - 1) * 5, batch * 5);
    const last = batch * 5 >= all.length;
    return { kept: sent.filter(keep), reach: last ? Infinity : Math.max(...sent.map((card) => parseFloat(card.distance))) };
  });
}

describe("batchFrom", () => {
  const page = (listings: Card[], to: number, total: number) => ({ listings, to, total });

  it("reaches as far as its furthest card, keeping those asked for", () => {
    const batch = batchFrom(page([at("a", 0.1), at("b", 0.4), at("c", 0.2)], 3, 10), (card) => card.slug !== "b");
    expect([slugs(batch.kept), batch.reach]).toEqual([["a", "c"], 0.4]);
  });

  it("reaches all the way as the last batch, or an empty one", () => {
    expect(batchFrom(page([at("a", 0.1)], 10, 10)).reach).toBe(Infinity);
    expect(batchFrom(page([], 0, 10)).reach).toBe(Infinity);
  });
});

describe("streamsFrom", () => {
  it("starts each stream with its first batch, asking next for the second", () => {
    expect(streamsFrom([{ kept: [at("a", 0.1)], reach: 0.1 }])).toEqual([{ waiting: [at("a", 0.1)], reach: 0.1, next: 2 }]);
  });
});

describe("ready", () => {
  it("lists only the cards nearer than every search reaches, in the seed's order", () => {
    const streams = [
      { waiting: [at("a1", 0.1), at("a2", 0.5), at("a3", 0.9)], reach: 0.9, next: 2 },
      { waiting: [at("b1", 0.3), at("b2", 0.5)], reach: 0.5, next: 2 },
    ];
    // The second reaches 0.5 miles, where more of it may yet come.
    expect(slugs(ready(streams, SEED))).toEqual(["a1", "b1"]);
  });

  it("lists once a card both searches sent", () => {
    const streams = [
      { waiting: [at("a1", 0.1), at("both", 0.2)], reach: Infinity, next: 2 },
      { waiting: [at("both", 0.2)], reach: Infinity, next: 2 },
    ];
    expect(slugs(ready(streams, SEED))).toEqual(["a1", "both"]);
  });

  it("lists every card once each search is loaded whole", () => {
    const streams = [
      { waiting: [at("a1", 0.1), at("a2", 0.5)], reach: Infinity, next: 2 },
      { waiting: [at("b1", 0.3)], reach: Infinity, next: 2 },
    ];
    expect(slugs(ready(streams, SEED))).toEqual(["a1", "b1", "a2"]);
  });
});

describe("takeMerged", () => {
  // One card a tenth of a mile apart in the first; one a quarter apart in the second, of which only every other is kept.
  const first = Array.from({ length: 20 }, (_, i) => at(`a${i}`, (i + 1) / 10));
  const second = Array.from({ length: 10 }, (_, i) => at(`b${i}`, (i + 1) / 4));
  const keep = (card: Card) => !card.slug.startsWith("b") || Number(card.slug.slice(1)) % 2 === 0;

  it("asks both searches for their first batch at once, then the one reaching least, until a page is ready", async () => {
    const load = batches([first, second], keep);
    const page1 = await takeMerged(unloaded(2), 4, SEED, load);
    expect(slugs(page1.taken)).toEqual(["a0", "a1", "b0", "a2"]);
    expect(load.mock.calls).toEqual([
      [0, 1],
      [1, 1],
    ]);
    // Only a3 is nearer than 0.5 miles, where the first's batch ends, so it asks for the first's next.
    const page2 = await takeMerged(page1.streams, 4, SEED, load);
    expect(slugs(page2.taken)).toEqual(["a3", "a4", "a5", "a6"]);
    expect(load.mock.calls.at(-1)).toEqual([0, 2]);
  });

  it("takes all that remain once both are loaded whole, and has no more", async () => {
    const load = batches([first.slice(0, 3), second.slice(0, 3)], keep);
    const { taken, streams } = await takeMerged(unloaded(2), 12, SEED, load);
    expect(slugs(taken)).toEqual(["a0", "a1", "b0", "a2", "b2"]);
    expect(moreIn(streams)).toBe(false);
  });

  it("has more while any card waits or any search has batches to come", async () => {
    const load = batches([first, second], keep);
    const { streams } = await takeMerged(unloaded(2), 2, SEED, load);
    expect(moreIn(streams)).toBe(true);
    expect(moreIn([{ waiting: [at("a1", 0.1)], reach: Infinity, next: 2 }])).toBe(true);
    expect(moreIn([{ waiting: [], reach: Infinity, next: 2 }])).toBe(false);
  });

  it("lists once a card a later batch sends again, as UKCP reshuffles people at one distance", async () => {
    const load = vi.fn(async (_: number, batch: number): Promise<Batch<Card>> =>
      batch === 1 ? { kept: [at("a1", 0.1), at("a2", 0.5)], reach: 0.5 } : { kept: [at("a2", 0.5), at("a3", 0.6)], reach: Infinity },
    );
    const { taken } = await takeMerged(unloaded(1), 12, SEED, load);
    expect(slugs(taken)).toEqual(["a1", "a2", "a3"]);
  });
});
