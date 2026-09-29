import { settlementRank, type PlaceLookup } from "@shared/location";

export type Point = { lat: number; lng: number };
type Found = Extract<PlaceLookup, { found: true }>;

export const METRES_PER_MILE = 1609.344;
/** The whole UK, shown until there is a search. */
export const UK_VIEW = { centre: [54.5, -3] as [number, number], zoom: 5 };
const EARTH_RADIUS_MILES = 3958.8;

export function milesBetween(a: Point, b: Point): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/** How far from `centre` the furthest of `points` is, in miles. */
export function furthestMiles(centre: Point, points: Point[]): number | undefined {
  return points.length === 0 ? undefined : Math.max(...points.map((point) => milesBetween(centre, point)));
}

/** A place name can match several places: take the one nearest the search, or failing that the most settled. */
export function choosePoint(lookup: Found, centre?: Point): Point | undefined {
  const candidates = [...lookup.candidates];
  if (lookup.kind === "place") {
    candidates.sort(centre ? (a, b) => milesBetween(a, centre) - milesBetween(b, centre) : (a, b) => settlementRank(a.type) - settlementRank(b.type));
  }
  const best = candidates[0];
  return best && { lat: best.lat, lng: best.lng };
}
