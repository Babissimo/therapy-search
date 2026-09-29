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

/** How much of the search is loaded and, for a location search, how far out it reaches. */
export function reachLine(loaded: TherapistCard[], total: number, located: boolean): string {
  if (total === 0) return "No results";
  if (!located) return `${loaded.length} of ${total}`;
  const furthest = reachMiles(loaded);
  if (furthest === undefined) return `Nearest ${loaded.length} of ${total}`;
  return `Nearest ${loaded.length} of ${total}, up to ${furthest} ${furthest === 1 ? "mile" : "miles"} away`;
}

export function resultCount(total: number | undefined): string {
  if (total === undefined) return "Results";
  if (total === 0) return "No results";
  return total === 1 ? "1 result" : `${total} results`;
}
