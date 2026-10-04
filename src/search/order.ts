import { browserStorage } from "@/lib/storage";
import { inOrder, milesOf, newSeed, readSeed, type Ordered } from "@shared/order";

export { inOrder } from "@shared/order";

const KEY = "order-seed";

type SeedStorage = Pick<Storage, "getItem" | "setItem">;

let pageSeed: number | undefined;

/**
 * This browser's seed for the order of results. UKCP reshuffles its results on almost every request, so a visitor
 * coming back to a search sees it in the same order only because this seed is kept.
 */
export function orderSeed(): number {
  return (pageSeed ??= storedSeed(browserStorage()));
}

/** The seed kept in storage, or a new one kept in its place. */
export function storedSeed(storage: SeedStorage | null): number {
  const stored = readSeed(attempt(() => storage?.getItem(KEY)));
  if (stored !== undefined) return stored;
  const seed = newSeed();
  // Private browsing can refuse writes; the order then lasts for this page load only.
  attempt(() => storage?.setItem(KEY, String(seed)));
  return seed;
}

/** A storage call's answer, or undefined where the browser refuses it, since a search must not fail over its order. */
function attempt<T>(call: () => T): T | undefined {
  try {
    return call();
  } catch {
    return undefined;
  }
}

/**
 * Of a location search's nearest few, those its whole batch puts first, in the batch's order. UKCP sends results nearest
 * first, so everyone nearer than the furthest sent has been sent, but the furthest may share their distance with people
 * not yet sent; `complete` says UKCP sent all it found.
 */
export function settled<T extends Ordered>(nearest: T[], complete: boolean, seed: number): T[] {
  const ordered = inOrder(nearest, seed);
  if (complete) return ordered;
  const furthest = Math.max(...nearest.map(milesOf));
  return ordered.filter((listing) => milesOf(listing) < furthest);
}
