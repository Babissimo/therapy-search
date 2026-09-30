import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { SEARCH_MILES } from "@shared/query";
import { METRES_PER_MILE, type Point } from "./geo";

/** A search's view, with how many pins it took in. */
export type Framed = { fitKey: string; pins: number };
type Props = {
  fitKey: string;
  centre?: Point;
  points: Point[];
  waiting: boolean;
  restored?: Framed;
  /** Frames without animating. */
  instant?: boolean;
  /** How much of the map's bottom, in pixels, lies under something laid over it, given the map's height. */
  coveredBelow?: (height: number) => number;
  /** Counts the visitor's asks to recentre, each of which frames the search again though nothing new has arrived. */
  recentres?: number;
  onFramed?: () => void;
};

// Clear of the search box and filters over the top left of the map, with a margin on its other sides.
const TOP_LEFT: L.PointTuple = [48, 136];
const MARGIN = 48;
// Left to frame into however much covers the map: Leaflet zooms far out to fit less, or to street level if none.
const LEAST_ROOM = 128;
// Close enough to tell streets apart, even when every pin is at the centre.
const MAX_ZOOM = 14;

/**
 * Frames each search as its first page is placed, and again whenever Load more places further pins or the visitor
 * asks to recentre: around the centre and every pin, or the whole area searched when no pin is placed. With no centre
 * it frames the pins alone. A view restored on Back is left as it was until pins arrive beyond those it had, or the
 * visitor asks.
 * `onFramed` hears when the view is where the search puts it, or that there is nothing to frame.
 */
export function FitView({ fitKey, centre, points, waiting, restored, instant, coveredBelow, recentres = 0, onFramed }: Props) {
  const map = useMap();
  const framed = useRef(restored);
  const recentred = useRef(recentres);
  useEffect(() => {
    const last = framed.current;
    const taken = recentres === recentred.current && last?.fitKey === fitKey && points.length <= last.pins;
    if (waiting || taken) return;
    recentred.current = recentres;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    if (centre) bounds.extend(points.length > 0 ? L.latLng(centre) : L.latLng(centre).toBounds(2 * SEARCH_MILES * METRES_PER_MILE));
    const height = map.getSize().y;
    const covered = Math.max(0, Math.min(coveredBelow?.(height) ?? 0, height - TOP_LEFT[1] - MARGIN - LEAST_ROOM));
    const options: L.FitBoundsOptions = { paddingTopLeft: TOP_LEFT, paddingBottomRight: [MARGIN, MARGIN + covered], maxZoom: MAX_ZOOM };
    // Only ever false: an explicit true would animate even a pan across the country.
    if (instant) options.animate = false;
    if (!bounds.isValid()) {
      onFramed?.();
      return;
    }
    // Leaflet ends every fit with a moveend, at once or when an animation comes to rest, even when the view stays put.
    if (onFramed) map.once("moveend", onFramed);
    map.fitBounds(bounds, options);
    framed.current = { fitKey, pins: points.length };
  }, [map, fitKey, centre, points, waiting, instant, coveredBelow, recentres, onFramed]);
  return null;
}
