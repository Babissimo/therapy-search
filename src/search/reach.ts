import type { TherapistCard } from "@shared/types";

/** The miles in a card's distance, such as "0.6 miles from Brighton". */
export function parseMiles(distance: string | undefined): number | undefined {
  const match = /^([\d.]+)\s+miles?\b/i.exec(distance ?? "");
  return match ? Number(match[1]) : undefined;
}

/** How much of the search is loaded and, for a location search, how far out it reaches. */
export function reachLine(loaded: TherapistCard[], total: number, located: boolean): string {
  if (total === 0) return "No results";
  if (!located) return `${loaded.length} of ${total}`;
  const miles = loaded.map((t) => parseMiles(t.distance)).filter((m): m is number => m !== undefined);
  if (miles.length === 0) return `Nearest ${loaded.length} of ${total}`;
  const furthest = Math.max(...miles);
  return `Nearest ${loaded.length} of ${total}, up to ${furthest} ${furthest === 1 ? "mile" : "miles"} away`;
}

export function resultCount(total: number | undefined): string {
  if (total === undefined) return "Results";
  if (total === 0) return "No results";
  return total === 1 ? "1 result" : `${total} results`;
}
