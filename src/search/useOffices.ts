import { useQueries } from "@tanstack/react-query";
import type { OfficeDetails } from "@shared/office";
import type { TherapistCard } from "@shared/types";
import { api } from "@/lib/api";
import { lookupText } from "./map/pins";

type Card = Pick<TherapistCard, "slug" | "location">;

/**
 * What each therapist's profile says of the office their card names: its postcode, for the map, and its fee, for the
 * card. Asked only while `enabled`, one profile read per therapist and office however many places show them, and kept for
 * the session; an answer nothing shows any more is no longer waited for.
 */
export function useOffices(therapists: Card[], enabled: boolean): { officeOf: (t: Card) => OfficeDetails | undefined; pending: (t: Card) => boolean } {
  const asked = enabled
    ? therapists.flatMap((t) => {
        // A card naming nothing a geocoder could place names no office either.
        const location = lookupText(t.location);
        return location ? [{ slug: t.slug, location }] : [];
      })
    : [];
  const queries = useQueries({
    queries: asked.map(({ slug, location }) => ({
      queryKey: ["office", { slug, location }],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.office(slug, location, signal),
      staleTime: Infinity,
      gcTime: Infinity,
    })),
  });
  const byCard = new Map(asked.map(({ slug, location }, i) => [`${slug} ${location}`, queries[i]] as const));
  const queryOf = (t: Card) => byCard.get(`${t.slug} ${lookupText(t.location)}`);
  return { officeOf: (t) => queryOf(t)?.data, pending: (t) => queryOf(t)?.isPending ?? false };
}
