import type { Point, View } from "./geo";

/** A square view `miles` across, centred on `middle`. */
export function viewAround(middle: Point, miles: number): View {
  const lat = miles / 69.05 / 2;
  const lng = lat / Math.cos((middle.lat * Math.PI) / 180);
  return { north: middle.lat + lat, south: middle.lat - lat, east: middle.lng + lng, west: middle.lng - lng };
}
