import { inOrder, milesOf, type Ordered } from "./order";

/**
 * Searches near one place listed as one, nearest first. UKCP sends each search's results nearest first, batch by batch,
 * so every card nearer than a search's furthest loaded has been loaded, but the furthest may share its distance with
 * cards still to come. A card is listed only once it is nearer than every search has reached, so none comes before it later.
 */

/** A search's results as loaded so far. */
export type Stream<T> = {
  /** Cards loaded and not yet listed. */
  waiting: T[];
  /** The miles short of which every card has been loaded: the furthest loaded card's, or Infinity once all are. */
  reach: number;
  /** The batch to ask for next, counting from 1. */
  next: number;
};

/** A batch as its stream takes it: the cards kept from it, and its furthest card's miles, or Infinity for the last. */
export type Batch<T> = { kept: T[]; reach: number };

/** A batch of UKCP's results as its stream takes it, keeping those `keep` lets through. */
export function batchFrom<T extends Ordered>(
  { listings, to, total }: { listings: T[]; to: number; total: number },
  keep: (card: T) => boolean = () => true,
): Batch<T> {
  const last = listings.length === 0 || to >= total;
  return { kept: listings.filter(keep), reach: last ? Infinity : Math.max(...listings.map(milesOf)) };
}

/** Streams that have each taken their first batch. */
export function streamsFrom<T extends Ordered>(batches: Batch<T>[]): Stream<T>[] {
  return batches.map((batch) => withBatch({ waiting: [], reach: 0, next: 1 }, batch));
}

/** Whether any card is still to be listed. */
export function moreIn<T>(streams: Stream<T>[]): boolean {
  return streams.some((stream) => stream.waiting.length > 0 || stream.reach < Infinity);
}

/** The cards waiting that no batch still to come can come before, each once, in `seed`'s order. */
export function ready<T extends Ordered>(streams: Stream<T>[], seed: number): T[] {
  const reach = Math.min(...streams.map((stream) => stream.reach));
  const near = new Map(streams.flatMap((stream) => stream.waiting.filter((card) => milesOf(card) < reach).map((card) => [card.slug, card] as const)));
  return inOrder([...near.values()], seed);
}

/** Takes a batch into its stream, leaving out anyone already waiting, as UKCP reshuffles people at one distance between batches. */
export function withBatch<T extends Ordered>(stream: Stream<T>, { kept, reach }: Batch<T>): Stream<T> {
  const waiting = new Set(stream.waiting.map((card) => card.slug));
  return { waiting: [...stream.waiting, ...kept.filter((card) => !waiting.has(card.slug))], reach, next: stream.next + 1 };
}

/**
 * The next `count` cards across `streams`, and the streams without them. Short of that many ready, it asks `load` for the
 * next batch of the streams that reach least, together, until that many are ready or every stream is loaded.
 */
export async function takeMerged<T extends Ordered>(
  streams: Stream<T>[],
  count: number,
  seed: number,
  load: (stream: number, batch: number) => Promise<Batch<T>>,
): Promise<{ taken: T[]; streams: Stream<T>[] }> {
  let current = streams;
  let listed = ready(current, seed);
  while (listed.length < count && current.some((stream) => stream.reach < Infinity)) {
    const least = Math.min(...current.map((stream) => stream.reach));
    const batches = await Promise.all(current.map((stream, i) => (stream.reach === least ? load(i, stream.next) : undefined)));
    current = current.map((stream, i) => (batches[i] ? withBatch(stream, batches[i]) : stream));
    listed = ready(current, seed);
  }
  const taken = listed.slice(0, count);
  const gone = new Set(taken.map((card) => card.slug));
  return { taken, streams: current.map((stream) => ({ ...stream, waiting: stream.waiting.filter((card) => !gone.has(card.slug)) })) };
}
