import { canonicalLocation } from "@shared/location";
import type { Office, TherapistCard } from "@shared/types";

/**
 * The office a search's card measured its distance to, which UKCP picks as the one nearest the search. The card names it
 * by its town and the first word of its postcode, which begin the line of its address that gives both. A line that is
 * the whole name beats one that goes on to the rest of a postcode; between equals, the first office listed wins.
 */
export function nearestOffice(offices: Office[], card: TherapistCard | undefined): number | undefined {
  if (!card?.location || card.distance === undefined) return undefined;
  const name = canonicalLocation(card.location);
  const fit = (line: string) => (line === name ? 2 : line.startsWith(`${name} `) ? 1 : 0);
  const fits = offices.map((office) => Math.max(0, ...office.address.map((line) => fit(canonicalLocation(line)))));
  const best = Math.max(0, ...fits);
  return best > 0 ? fits.indexOf(best) : undefined;
}
