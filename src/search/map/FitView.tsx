import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { SEARCH_MILES } from "@shared/query";
import { METRES_PER_MILE, UK_VIEW, type Point } from "./geo";

/** A search's view and how many pins it took in. */
export type Framed = { fitKey: string; pins: number };
type Props = { fitKey: string; centre?: Point; reachMiles?: number; points: Point[]; waiting: boolean; restored?: Framed };

// Clear of the search box and filters over the top left of the map.
const PADDING = { paddingTopLeft: [48, 96], paddingBottomRight: [48, 48] } satisfies L.FitBoundsOptions;
// Close enough to tell streets apart, even when every pin is at the centre.
const MAX_ZOOM = 14;

/**
 * Frames each search as its first page is placed, and again whenever Load more places further pins: around the circle
 * the pins reach, or the whole area searched when there are none. With no centre it frames the pins alone. A view
 * restored on Back is left as it was until pins arrive beyond those it had. With nothing searched it shows the UK.
 */
export function FitView({ fitKey, centre, reachMiles, points, waiting, restored }: Props) {
  const map = useMap();
  const framed = useRef(restored);
  useEffect(() => {
    const last = framed.current;
    if (waiting || (last?.fitKey === fitKey && points.length <= last.pins)) return;
    const bounds = centre
      ? L.latLng(centre).toBounds(2 * (reachMiles ?? SEARCH_MILES) * METRES_PER_MILE)
      : L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    if (fitKey === "") map.setView(UK_VIEW.centre, UK_VIEW.zoom);
    else if (bounds.isValid()) map.fitBounds(bounds, { ...PADDING, maxZoom: MAX_ZOOM });
    else return;
    framed.current = { fitKey, pins: points.length };
  }, [map, fitKey, centre, reachMiles, points, waiting]);
  return null;
}
