import { browserStorage } from "@/lib/storage";
import { parseMiles } from "./reach";

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
  const stored = attempt(() => storage?.getItem(KEY));
  if (stored && /^\d{1,10}$/.test(stored) && Number(stored) <= 0xffffffff) return Number(stored);
  const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
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

/** A therapist's place in a seed's order: 32-bit FNV-1a of the seed and their slug, so no one else's presence moves it. */
export function rank(seed: number, slug: string): number {
  const key = `${seed}:${slug}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

type Shown = { hasPhoto: boolean; hasSummary: boolean };
type Ordered = Shown & { slug: string; distance?: string };

/** How much a card shows beyond a name: one each for a photo and a summary. */
function detail({ hasPhoto, hasSummary }: Shown): number {
  return Number(hasPhoto) + Number(hasSummary);
}

/** A card's distance as UKCP ranks it, a card without one counting as 0 miles. */
function milesOf({ distance }: { distance?: string }): number {
  return parseMiles(distance) ?? 0;
}

/**
 * Listings in a seed's order. UKCP's distances come first, so a location search stays nearest first and only the
 * people at the same distance are reordered, those whose cards show more ahead. A card without a distance counts as
 * 0 miles, as UKCP ranks it, so a search without a location orders everyone by what their card shows.
 */
export function inOrder<T extends Ordered>(listings: T[], seed: number): T[] {
  return listings
    .map((listing) => ({ listing, miles: milesOf(listing), detail: detail(listing), rank: rank(seed, listing.slug) }))
    .sort(
      (a, b) =>
        a.miles - b.miles ||
        b.detail - a.detail ||
        a.rank - b.rank ||
        (a.listing.slug < b.listing.slug ? -1 : a.listing.slug > b.listing.slug ? 1 : 0),
    )
    .map(({ listing }) => listing);
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
