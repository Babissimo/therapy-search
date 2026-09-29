import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { SEARCH_MILES } from "@shared/query";
import { METRES_PER_MILE, UK_VIEW, type Point } from "./geo";

/** A search's view, with how many pins and how far a circle it took in. */
export type Framed = { fitKey: string; pins: number; reach?: number };
type Props = {
  fitKey: string;
  centre?: Point;
  reachMiles?: number;
  points: Point[];
  waiting: boolean;
  restored?: Framed;
  /** Frames without animating. */
  instant?: boolean;
  onFramed?: () => void;
};

// Clear of the search box and filters over the top left of the map.
const PADDING = { paddingTopLeft: [48, 96], paddingBottomRight: [48, 48] } satisfies L.FitBoundsOptions;
// Close enough to tell streets apart, even when every pin is at the centre.
const MAX_ZOOM = 14;

/**
 * Frames each search as its first page is placed, and again whenever Load more places further pins or the circle
 * reaches further: around the circle and every pin, or the whole area searched when nothing lies beyond the centre.
 * With no centre it frames the pins alone. A view restored on Back is left as it was until pins or a circle arrive
 * beyond those it had. With nothing searched it shows the UK.
 * `onFramed` hears when the view is where the search puts it, or that there is nothing to frame.
 */
export function FitView({ fitKey, centre, reachMiles, points, waiting, restored, instant, onFramed }: Props) {
  const map = useMap();
  const framed = useRef(restored);
  useEffect(() => {
    const last = framed.current;
    const taken = last?.fitKey === fitKey && points.length <= last.pins && (reachMiles ?? 0) <= (last.reach ?? 0);
    if (waiting || taken) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    const miles = reachMiles !== undefined && (reachMiles > 0 || points.length > 0) ? reachMiles : SEARCH_MILES;
    if (centre) bounds.extend(L.latLng(centre).toBounds(2 * miles * METRES_PER_MILE));
    const options: L.FitBoundsOptions = { ...PADDING, maxZoom: MAX_ZOOM };
    // Only ever false: an explicit true would animate even a pan across the country.
    if (instant) options.animate = false;
    if (fitKey === "") map.setView(UK_VIEW.centre, UK_VIEW.zoom);
    else if (bounds.isValid()) map.fitBounds(bounds, options);
    else {
      onFramed?.();
      return;
    }
    framed.current = { fitKey, pins: points.length, reach: reachMiles };
    onFramed?.();
  }, [map, fitKey, centre, reachMiles, points, waiting, instant, onFramed]);
  return null;
}
