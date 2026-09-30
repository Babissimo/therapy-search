import { canonicalLocation, classifyLocation, type PlaceLookup } from "@shared/location";
import type { TherapistCard } from "@shared/types";
import { choosePoint, milesBetween, type Point } from "./geo";

/** `kind` is what placed the pin, which can be less than a card gives when a postcode or district is unknown. */
export type Pin = { key: string; point: Point; therapists: TherapistCard[]; kind: PlacedKind };
type PlacedKind = Extract<PlaceLookup, { found: true }>["kind"];
/** A settled lookup of a card's location; `ok: false` when the lookup itself failed. */
export type LookupResult = { ok: true; lookup: PlaceLookup } | { ok: false };

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
): { pins: Pin[]; unplaced: TherapistCard[] } {
  const pins = new Map<string, Pin>();
  const unplaced: TherapistCard[] = [];
  for (const therapist of therapists) {
    const result = lookupFor(therapist);
    if (!result) continue;
    if (!result.ok || !result.lookup.found) {
      unplaced.push(therapist);
      continue;
    }
    const { lookup } = result;
    const point = choosePoint(lookup, centre);
    if (!point || (lookup.kind === "place" && centre && milesBetween(point, centre) > 2 * distanceMiles + 5)) {
      unplaced.push(therapist);
      continue;
    }
    const key = `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
    const pin = pins.get(key);
    if (pin) pin.therapists.push(therapist);
    else pins.set(key, { key, point, therapists: [therapist], kind: lookup.kind });
  }
  return { pins: [...pins.values()], unplaced };
}

/** The pin each therapist is on, by their slug. */
export function pinsBySlug(pins: Pin[]): Map<string, Pin> {
  return new Map(pins.flatMap((pin) => pin.therapists.map((t) => [t.slug, pin] as const)));
}

/** A row of the results list: one therapist, or everyone at a stacked pin. */
export type Entry = { key: string; pin?: Pin; therapist: TherapistCard } | { key: string; pin: Pin; therapist?: undefined };

/** The results in their own order, with everyone at a stacked pin gathered where the first of them comes. */
export function listEntries(therapists: TherapistCard[], pins: Pin[]): Entry[] {
  const pinOf = pinsBySlug(pins);
  const gathered = new Set<string>();
  const entries: Entry[] = [];
  for (const therapist of therapists) {
    const pin = pinOf.get(therapist.slug);
    if (!pin || pin.therapists.length === 1) entries.push({ key: therapist.slug, pin, therapist });
    else if (!gathered.has(pin.key)) {
      gathered.add(pin.key);
      entries.push({ key: pin.key, pin });
    }
  }
  return entries;
}

/** What everyone at a pin lists: the location they share, or else the postcodes, districts or places that placed them. */
export function pinLabel(pin: Pin): string {
  const listed = pin.therapists.map((t) => t.location ?? "");
  if (new Set(listed.map(canonicalLocation)).size === 1) return listed[0]?.trim() ?? "";
  const placed = new Map<string, string>();
  for (const location of listed) {
    const shown = placedBy(location, pin.kind);
    if (!placed.has(shown.toUpperCase())) placed.set(shown.toUpperCase(), shown);
  }
  return [...placed.values()].join(", ");
}

/** The part of a card's location that placed it, as the geocoder falls back from a postcode to its district to its place. */
function placedBy(location: string, kind: PlacedKind): string {
  const text = classifyLocation(location);
  if (text.kind === "too-general") return "";
  if (kind === "postcode" && text.kind === "postcode") return text.postcode;
  if (kind !== "place" && text.kind !== "place") return text.outcode;
  const name = text.kind === "place" ? text.name : text.rest;
  // A place as the therapist writes it, rather than in the capitals it is compared in.
  const written = location.trim().replace(/\s+/g, " ");
  const upper = written.toUpperCase();
  const at = upper.length === written.length ? upper.indexOf(name) : -1;
  return at === -1 ? name : written.slice(at, at + name.length);
}

/** A remote-only therapist's location says nothing about travel. */
export function isRemoteOnly(therapist: TherapistCard): boolean {
  const types = therapist.sessionTypes ?? "";
  return /remote/i.test(types) && !/in-person/i.test(types);
}
