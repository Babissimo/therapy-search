import { useQueries, useQuery } from "@tanstack/react-query";
import { canonicalLocation } from "@shared/location";
import { SEARCH_MILES } from "@shared/query";
import type { TherapistCard } from "@shared/types";
import { api } from "@/lib/api";
import { choosePoint, type Point } from "./geo";
import { layoutPins, lookupText, officeDistrict, type LookupResult, type Pin } from "./pins";

/** Before the centre is known, when place names can't yet be judged by their distance from it. */
const NOT_LAID_OUT: ReturnType<typeof layoutPins> = { pins: [], unplaced: [] };

/** The point UKCP measured distances from; `settled` is false while it is being looked up. Places don't move, so answers last the session. */
export function useCentre(place: string | undefined, outsideUK: boolean): { point?: Point; settled: boolean } {
  const canonical = place === undefined ? undefined : canonicalLocation(place);
  const query = useQuery({
    queryKey: ["place", { text: canonical, centre: true, outsideUK }],
    queryFn: () => api.place(canonical ?? "", { centre: true, outsideUK }),
    enabled: canonical !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  if (canonical === undefined) return { settled: true };
  if (query.status === "pending") return { settled: false };
  const lookup = query.status === "success" ? query.data : undefined;
  return { point: lookup?.found ? choosePoint(lookup) : undefined, settled: true };
}

const TOO_GENERAL: LookupResult = { ok: true, lookup: { found: false, reason: "too-general" } };

/** Looks up each distinct card location once. Places don't move, so answers last the session. */
export function useCardLookups(locations: (string | undefined)[], outsideUK: boolean) {
  const texts = [...new Set(locations.map((location) => lookupText(location)).filter((text): text is string => text !== null))];
  const queries = useQueries({
    queries: texts.map((text) => ({
      queryKey: ["place", { text, outsideUK }],
      queryFn: () => api.place(text, { outsideUK }),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });
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
 * The postcode of each therapist's office in the district their card gives, where their profile has one, and whether any
 * is still being asked for. Asked only of cards giving no more than a district, at home, and kept for the session; an
 * answer nothing shows any more is no longer waited for.
 */
export function useOfficePostcodes(
  therapists: TherapistCard[],
  enabled: boolean,
): { officeOf: (therapist: TherapistCard) => string | undefined; asking: boolean } {
  const asked = enabled
    ? therapists.flatMap((t) => {
        const outcode = officeDistrict(t.location);
        return outcode ? [{ slug: t.slug, outcode }] : [];
      })
    : [];
  const queries = useQueries({
    queries: asked.map(({ slug, outcode }) => ({
      queryKey: ["office", { slug, outcode }],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.office(slug, outcode, signal),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });
  const answers = new Map(asked.map(({ slug, outcode }, i) => [`${slug} ${outcode}`, queries[i]?.data] as const));
  const officeOf = (therapist: TherapistCard) => {
    const answer = answers.get(`${therapist.slug} ${officeDistrict(therapist.location)}`);
    return answer?.found ? answer.postcode : undefined;
  };
  return { officeOf, asking: queries.some((query) => query.isPending) };
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
  const { officeOf, asking } = useOfficePostcodes(therapists, !outsideUK);
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
    moving: asking || therapists.some((t) => officeOf(t) !== undefined && lookupFor(officeOf(t)) === undefined),
  };
}
