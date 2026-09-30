import { useQueries, useQuery } from "@tanstack/react-query";
import { canonicalLocation } from "@shared/location";
import { SEARCH_MILES } from "@shared/query";
import type { TherapistCard } from "@shared/types";
import { api } from "@/lib/api";
import { choosePoint, type Point } from "./geo";
import { layoutPins, lookupText, type LookupResult, type Pin } from "./pins";

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

/** The therapists' pins, those who can't be placed, and whether any place is still being looked up. */
export function usePins(
  therapists: TherapistCard[],
  centre: { point?: Point; settled: boolean },
  outsideUK: boolean,
): { pins: Pin[]; unplaced: TherapistCard[]; placing: boolean } {
  const lookupFor = useCardLookups(therapists.map((t) => t.location), outsideUK);
  const { pins, unplaced } = centre.settled ? layoutPins(therapists, (t) => lookupFor(t.location), centre.point, SEARCH_MILES) : NOT_LAID_OUT;
  return { pins, unplaced, placing: therapists.some((t) => lookupFor(t.location) === undefined) };
}
