import type { TherapistCard } from "@shared/types";

/** The miles in a card's distance, such as "0.6 miles from Brighton". */
export function parseMiles(distance: string | undefined): number | undefined {
  const match = /^([\d.]+)\s+miles?\b/i.exec(distance ?? "");
  return match ? Number(match[1]) : undefined;
}

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

export function resultCount(total: number | undefined): string {
  if (total === undefined) return "Results";
  if (total === 0) return "No results";
  return total === 1 ? "1 result" : `${total} results`;
}
