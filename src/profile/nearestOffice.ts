import { officeNamed } from "@shared/office";
import type { Office, TherapistCard } from "@shared/types";

/** The office a search's card measured its distance to, which UKCP picks as the one nearest the search. */
export function nearestOffice(offices: Office[], card: TherapistCard | undefined): number | undefined {
  if (!card?.location || card.distance === undefined) return undefined;
  return officeNamed(offices, card.location);
}
