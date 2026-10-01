import { useQueries, useQuery } from "@tanstack/react-query";
import { canonicalLocation, classifyLocation } from "@shared/location";
import { SEARCH_MILES } from "@shared/query";
import type { TherapistCard } from "@shared/types";
import { placeLookup } from "@/lib/placeLookup";
import { useOffices } from "@/search/useOffices";
import { choosePoint, type Point } from "./geo";
import { layoutPins, lookupText, officeDistrict, type LookupResult, type Pin } from "./pins";

/** Before the centre is known, when place names can't yet be judged by their distance from it. */
const NOT_LAID_OUT: ReturnType<typeof layoutPins> = { pins: [], unplaced: [] };

/** The point UKCP measured distances from; `settled` is false while it is being looked up. */
export function useCentre(place: string | undefined, outsideUK: boolean): { point?: Point; settled: boolean } {
  const canonical = place === undefined ? undefined : canonicalLocation(place);
  const query = useQuery(placeLookup(canonical, { centre: true, outsideUK }));
  if (canonical === undefined) return { settled: true };
  if (query.status === "pending") return { settled: false };
  const lookup = query.status === "success" ? query.data : undefined;
  return { point: lookup?.found ? choosePoint(lookup) : undefined, settled: true };
}

const TOO_GENERAL: LookupResult = { ok: true, lookup: { found: false, reason: "too-general" } };

/** Looks up each distinct card location once. */
export function useCardLookups(locations: (string | undefined)[], outsideUK: boolean) {
  const texts = [...new Set(locations.map((location) => lookupText(location)).filter((text): text is string => text !== null))];
  const queries = useQueries({ queries: texts.map((text) => placeLookup(text, { outsideUK })) });
  const byText = new Map(texts.map((text, i) => [text, queries[i]] as const));
  return (location: string | undefined): LookupResult | undefined => {
    const text = lookupText(location);
    if (text === null) return TOO_GENERAL;
    const query = byText.get(text);
    if (query?.status === "error") return { ok: false };
    if (query?.status === "success") return { ok: true, lookup: query.data };
    return undefined;
  };
}

/**
 * The therapists' pins, those who can't be placed, and whether any card's place is still being looked up. A pin moves
 * to its office's postcode once that is placed, and until then, or if it can't be, stays where the card's location puts
 * it. Offices are left out of `placing`, so the map never waits on UKCP to frame, and counted in `moving`, as a pin they
 * move can join or leave a stack, redrawing the list's entries.
 */
export function usePins(
  therapists: TherapistCard[],
  centre: { point?: Point; settled: boolean },
  outsideUK: boolean,
): { pins: Pin[]; unplaced: TherapistCard[]; placing: boolean; moving: boolean } {
  const offices = useOffices(therapists, !outsideUK);
  // Only a card giving no more than a district is placed better by its office's postcode, and only by one in that district.
  const officeOf = (therapist: TherapistCard) => {
    const district = officeDistrict(therapist.location);
    const postcode = district ? offices.officeOf(therapist)?.postcode : undefined;
    const office = postcode === undefined ? undefined : classifyLocation(postcode);
    return office?.kind === "postcode" && office.outcode === district ? postcode : undefined;
  };
  const lookupFor = useCardLookups([...therapists.map((t) => t.location), ...therapists.map(officeOf)], outsideUK);
  const placeOf = (therapist: TherapistCard): LookupResult | undefined => {
    const office = officeOf(therapist);
    const atOffice = office === undefined ? undefined : lookupFor(office);
    // A retired postcode falls back to its district, which places no better than the card.
    return atOffice?.ok && atOffice.lookup.found && atOffice.lookup.kind === "postcode" ? { ...atOffice, office } : lookupFor(therapist.location);
  };
  const { pins, unplaced } = centre.settled ? layoutPins(therapists, placeOf, centre.point, SEARCH_MILES) : NOT_LAID_OUT;
  return {
    pins,
    unplaced,
    placing: therapists.some((t) => lookupFor(t.location) === undefined),
    moving: therapists.some((t) => (officeDistrict(t.location) && offices.pending(t)) || (officeOf(t) !== undefined && lookupFor(officeOf(t)) === undefined)),
  };
}
