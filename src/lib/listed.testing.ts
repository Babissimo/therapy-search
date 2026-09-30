import type { SearchResult } from "@shared/types";
import type { Listings } from "@shared/ukcp/parseResults";

/** Cards as `api.search` answers with them, for tests that answer a search without UKCP's HTML. */
export function listed({ therapists, ...found }: SearchResult): Listings {
  return { ...found, listings: therapists.map((card) => ({ slug: card.slug, distance: card.distance, read: () => card })) };
}
