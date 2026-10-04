/**
 * The order results are listed in, by the app and the plain search alike. UKCP reshuffles its results about once a
 * minute and ignores any seed it is sent, so each keeps a seed of its own: the app one per browser, the plain search one
 * per search, carried in its forms.
 */

/** The miles in a card's distance, such as "0.6 miles from Brighton". */
export function parseMiles(distance: string | undefined): number | undefined {
  const match = /^([\d.]+)\s+miles?\b/i.exec(distance ?? "");
  return match ? Number(match[1]) : undefined;
}

/** A seed as kept or sent, or undefined where it is no whole number from 0 to 2^32 - 1. */
export function readSeed(text: string | null | undefined): number | undefined {
  return text && /^\d{1,10}$/.test(text) && Number(text) <= 0xffffffff ? Number(text) : undefined;
}

export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/** A therapist's place in a seed's order: 32-bit FNV-1a of the seed and their slug, so no one else's presence moves it. */
export function rank(seed: number, slug: string): number {
  const key = `${seed}:${slug}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/** A listing as it is ordered: its photo and summary count where they are known, and otherwise count as missing. */
export type Ordered = { slug: string; distance?: string; hasPhoto?: boolean; hasSummary?: boolean };

/** How much a card shows beyond a name: one each for a photo and a summary. */
function detail({ hasPhoto = false, hasSummary = false }: Ordered): number {
  return Number(hasPhoto) + Number(hasSummary);
}

/** A card's distance as UKCP ranks it, a card without one counting as 0 miles. */
export function milesOf({ distance }: { distance?: string }): number {
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
