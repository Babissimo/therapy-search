import { useQueries } from "@tanstack/react-query";
import { classifyLocation } from "@shared/location";
import type { TherapistCard } from "@shared/types";
import { officeLocation, officeLookup, officePlaceQuery } from "@/profile/place";
import { profileQuery } from "@/profile/profileQuery";
import { choosePoint, milesBetween, type Point } from "./geo";
import { useCardLookups } from "./usePlaces";

/** However many of a search's cards lack a distance, no more profiles than this are read for it. */
const MOST_PROFILES = 4;
/** More than the slack between a district's centre, where most cards are pinned, and an office's postcode in it. */
const NEARER_BY_MILES = 1;

type PlacedOffice = { location: string; point: Point };

/** Where the office nearest the centre is, when it is clearly nearer than the card's place. */
export function nearerLocation(offices: PlacedOffice[], card: Point | undefined, centre: Point): string | undefined {
  const [nearest] = offices.map((office) => ({ ...office, miles: milesBetween(office.point, centre) })).sort((a, b) => a.miles - b.miles);
  if (!nearest) return undefined;
  return card && milesBetween(card, centre) - nearest.miles <= NEARER_BY_MILES ? undefined : nearest.location;
}

/** The postal district a location names, if it names one. */
function districtOf(location: string | undefined): string | undefined {
  const text = location === undefined ? undefined : classifyLocation(location);
  return text?.kind === "postcode" || text?.kind === "outcode" ? text.outcode : undefined;
}

/**
 * UKCP gives each card the therapist's office nearest the search, with its distance. A card it gives none, in a search
 * where it measured the rest, can show an office far from one the therapist has nearby, so that card takes the nearest
 * of its profile's offices when it is clearly nearer. Until that is known the card is listed but not `ready` to map or
 * shortlist, so the map's frame never waits on UKCP.
 */
export function useNearerOffices(
  therapists: TherapistCard[],
  { point: centre, settled }: { point?: Point; settled: boolean },
  outsideUK: boolean,
): { therapists: TherapistCard[]; ready: TherapistCard[] } {
  // Without distances, as when UKCP searched the whole UK, there is no nearest office to find; outside the UK, a card's
  // location can't name the country to look in.
  const measured = !outsideUK && therapists.some((t) => t.distance !== undefined);
  const candidates = measured ? therapists.filter((t) => t.distance === undefined).slice(0, MOST_PROFILES) : [];
  const unmeasured = centre ? candidates : [];
  const profiles = useQueries({ queries: unmeasured.map((t) => profileQuery(t.slug)) });
  // An office in the card's own district is the one it shows, and one abroad can't be nearest.
  const offices = unmeasured.map((therapist, i) => {
    const profile = profiles[i]?.data;
    const district = districtOf(therapist.location);
    return (profile?.offices ?? []).flatMap((office) => {
      const location = officeLocation(office, profile?.location);
      const lookup = officeLookup(office, profile?.location);
      const text = lookup?.country ? undefined : lookup?.texts[0];
      return location && text && (district === undefined || districtOf(text) !== district) ? [{ location, text }] : [];
    });
  });
  // Therapists at one practice share its address, which is asked for once.
  const texts = [...new Set(offices.flat().map(({ text }) => text))];
  const places = useQueries({ queries: texts.map((text) => officePlaceQuery({ texts: [text] })) });
  const placeOf = new Map(texts.map((text, i) => [text, places[i]] as const));
  const lookupFor = useCardLookups(unmeasured.map((t) => t.location), outsideUK);
  if (!centre) return { therapists, ready: settled ? therapists : therapists.filter((t) => !candidates.includes(t)) };

  const moved = new Map<string, string>();
  const waiting = new Set<string>();
  unmeasured.forEach((therapist, i) => {
    const own = (offices[i] ?? []).map(({ location, text }) => ({ location, answer: placeOf.get(text) }));
    const card = lookupFor(therapist.location);
    if (profiles[i]?.isPending || own.some(({ answer }) => answer?.isPending) || card === undefined) {
      waiting.add(therapist.slug);
      return;
    }
    const placed = own.flatMap(({ location, answer }) => {
      const point = answer?.data?.found ? choosePoint(answer.data, centre) : undefined;
      return point ? [{ location, point }] : [];
    });
    const location = nearerLocation(placed, card.ok && card.lookup.found ? choosePoint(card.lookup, centre) : undefined, centre);
    if (location) moved.set(therapist.slug, location);
  });
  const shown = moved.size === 0 ? therapists : therapists.map((t) => (moved.has(t.slug) ? { ...t, location: moved.get(t.slug) } : t));
  return { therapists: shown, ready: waiting.size === 0 ? shown : shown.filter((t) => !waiting.has(t.slug)) };
}
