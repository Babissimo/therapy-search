import { settlementRank, type PlaceLookup } from "@shared/location";
import { SEARCH_MILES } from "@shared/query";

export type Point = { lat: number; lng: number };
/** A view's edges, as the map's bounds give them. */
export type View = { north: number; south: number; east: number; west: number };
type Found = Extract<PlaceLookup, { found: true }>;

export const METRES_PER_MILE = 1609.344;
/** The whole UK, where the map starts until a search is framed. */
export const UK_VIEW = { centre: [54.5, -3] as [number, number], zoom: 5 };
/**
 * Scilly and Jersey to Shetland, Fermanagh to Lowestoft. The margin lets a place at the edge sit clear of the map's,
 * and in the north clear of the search box over the top of it.
 */
export const UK_BOUNDS: [[number, number], [number, number]] = [
  [49, -9],
  [61.5, 2.5],
];
const EARTH_RADIUS_MILES = 3958.8;
/** A smaller move, however far in the map is zoomed, would search much the same place. */
const LEAST_MOVE_MILES = 0.5;

export function milesBetween(a: Point, b: Point): number {
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

/**
 * Whether the visitor has moved the map on purpose from `framed`, as the search framed it, to a view narrow enough to
 * mean a place other than the search's own `centre`, if it has one. `aim` is the middle of the part of the map in view,
 * where a search from it would be made.
 */
export function movedElsewhere(view: View, framed: View, aim: Point, centre?: Point): boolean {
  const span = spanOf(view);
  if (!meansAPlace(span)) return false;
  const near = (a: Point, b: Point) => milesBetween(a, b) <= Math.max(span / 4, LEAST_MOVE_MILES);
  // The frame takes in every pin, so its middle can lie far from the place searched, which zooming in on is no move.
  if (centre && near(aim, centre)) return false;
  // Nudges made while looking over the pins are no move to somewhere else, but a frame too wide to mean a place leaves
  // any view that does somewhere new, even one zoomed straight in.
  return !near(middleOf(view), middleOf(framed)) || !meansAPlace(spanOf(framed));
}

// Wider than a search reaches from side to side, a view's middle names no place anyone means.
function meansAPlace(span: number): boolean {
  return span <= 2 * SEARCH_MILES;
}

/** Across the narrower side of a view, in miles. */
function spanOf(view: View): number {
  const middle = middleOf(view);
  return Math.min(
    milesBetween({ lat: middle.lat, lng: view.west }, { lat: middle.lat, lng: view.east }),
    milesBetween({ lat: view.north, lng: middle.lng }, { lat: view.south, lng: middle.lng }),
  );
}

function middleOf(view: View): Point {
  return { lat: (view.north + view.south) / 2, lng: (view.east + view.west) / 2 };
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
