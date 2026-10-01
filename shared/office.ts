import { canonicalLocation } from "./location";

/** What a profile says of the office a card names: its full postcode and the text under its "Cost:" heading, where it gives them. */
export type OfficeDetails = { postcode?: string; cost?: string };

/**
 * The office a card's location names: UKCP writes it as the office's town and the first word of its postcode, which
 * begin the line of its address that gives both. A line that is the whole name beats one that goes on to the rest of a
 * postcode; between equals, the first office listed wins.
 */
export function officeNamed(offices: { address: string[] }[], location: string): number | undefined {
  const name = canonicalLocation(location);
  if (!name) return undefined;
  const fit = (line: string) => (line === name ? 2 : line.startsWith(`${name} `) ? 1 : 0);
  const fits = offices.map((office) => Math.max(0, ...office.address.map((line) => fit(canonicalLocation(line)))));
  const best = Math.max(0, ...fits);
  return best > 0 ? fits.indexOf(best) : undefined;
}
