import { canonicalLocation, classifyLocation, type PlaceLookup } from "@shared/location";
import type { TherapistCard } from "@shared/types";
import { choosePoint, milesBetween, type Point } from "./geo";

export type Pin = { key: string; point: Point; therapists: TherapistCard[] };
export type UnplacedReason = "too-general" | "not-matched" | "failed";
export type Unplaced = { therapist: TherapistCard; reason: UnplacedReason };
/** A settled lookup of a card's location; `ok: false` when the lookup itself failed. */
export type LookupResult = { ok: true; lookup: PlaceLookup } | { ok: false };

export const UNPLACED_REASONS: Record<UnplacedReason, string> = {
  "too-general": "Location too general to place",
  "not-matched": "Location couldn't be matched",
  failed: "Couldn't look up this location just now",
};

/** The text to look up for a card, or null when there is nothing a geocoder could place. */
export function lookupText(location: string | undefined): string | null {
  if (!location || classifyLocation(location).kind === "too-general") return null;
  return canonicalLocation(location);
}

/**
 * One pin per point, so therapists listing the same place stack together. A place-name match implausibly far
 * from the search is unplaced rather than shown where the therapist probably isn't; postcodes are unambiguous.
 */
export function layoutPins(
  therapists: TherapistCard[],
  lookupFor: (therapist: TherapistCard) => LookupResult | undefined,
  centre: Point | undefined,
  distanceMiles: number,
): { pins: Pin[]; unplaced: Unplaced[] } {
  const pins = new Map<string, Pin>();
  const unplaced: Unplaced[] = [];
  for (const therapist of therapists) {
    const result = lookupFor(therapist);
    if (!result) continue;
    if (!result.ok) {
      unplaced.push({ therapist, reason: "failed" });
      continue;
    }
    const { lookup } = result;
    if (!lookup.found) {
      unplaced.push({ therapist, reason: lookup.reason === "too-general" ? "too-general" : "not-matched" });
      continue;
    }
    const point = choosePoint(lookup, centre);
    if (!point || (lookup.kind === "place" && centre && milesBetween(point, centre) > 2 * distanceMiles + 5)) {
      unplaced.push({ therapist, reason: "not-matched" });
      continue;
    }
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    const pin = pins.get(key);
    if (pin) pin.therapists.push(therapist);
    else pins.set(key, { key, point, therapists: [therapist] });
  }
  return { pins: [...pins.values()], unplaced };
}

/** A remote-only therapist's location says nothing about travel. */
export function isRemoteOnly(therapist: TherapistCard): boolean {
  const types = therapist.sessionTypes ?? "";
  return /remote/i.test(types) && !/in-person/i.test(types);
}
