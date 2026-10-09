import { locationFellBack } from "@shared/location";
import { parseMiles } from "@shared/order";
import type { SearchParams } from "@shared/query";
import type { TherapistCard } from "@shared/types";
import type { SearchResults } from "./useResults";

/** The furthest of UKCP's distances among the loaded cards. UKCP measures to each therapist's address and lists them nearest first. */
export function reachMiles(loaded: TherapistCard[]): number | undefined {
  const miles = loaded.map((t) => parseMiles(t.distance)).filter((m): m is number => m !== undefined);
  return miles.length === 0 ? undefined : Math.max(...miles);
}

/** The list's heading: for a location search, how many are loaded and how far out they reach; otherwise how many there are. */
export function resultsHeading(loaded: TherapistCard[], total: number | undefined, located: boolean): string {
  if (!located || total === undefined) return resultCount(total);
  if (total === 0) return "No results within your area";
  const count = resultCount(loaded.length);
  const within = reachWithin(loaded);
  return within === undefined ? count : `${count} ${within}`;
}

/** How far out the loaded cards of a location search reach, such as "within 0.5 miles". */
export function reachWithin(loaded: TherapistCard[]): string | undefined {
  const furthest = reachMiles(loaded);
  if (furthest === undefined) return undefined;
  // UKCP rounds miles to a tenth, so its 0 means under a tenth.
  const miles = Math.max(furthest, 0.1);
  return `within ${miles} ${miles === 1 ? "mile" : "miles"}`;
}

/**
 * Where a search's results are, as the page's title names them, with a space before it: " within 0.6 miles of Leeds",
 * " near Leeds", " across the UK" or " working online or by phone"; or "" with nowhere to name.
 */
export function resultsWhere(
  params: SearchParams,
  { first, therapists, searchedPlace }: Pick<SearchResults, "first" | "therapists" | "searchedPlace">,
  online: boolean,
): string {
  if (online) return " working online or by phone";
  const typed = params.text.Location.trim();
  if (locationFellBack(typed, first?.locationSearched)) return " across the UK";
  // UKCP names the place in full, such as "Brighton, Brighton and Hove, UK".
  const place = searchedPlace?.split(",")[0] || typed;
  const within = searchedPlace !== undefined && (first?.total ?? 0) > 0 ? reachWithin(therapists) : undefined;
  if (within) return ` ${within} of ${place}`;
  return place ? ` near ${place}` : "";
}

export function resultCount(total: number | undefined): string {
  if (total === undefined) return "Results";
  if (total === 0) return "No results";
  return total === 1 ? "1 result" : `${total} results`;
}
