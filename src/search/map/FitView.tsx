import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { SEARCH_MILES } from "@shared/query";
import { METRES_PER_MILE, type Point } from "./geo";

/** A search's view, with how many therapists it took in. */
export type Framed = { fitKey: string; placed: number };
type Props = {
  fitKey: string;
  centre?: Point;
  points: Point[];
  /** How many therapists the points place, which a stack splitting into more pins leaves as it was. */
  placed: number;
  waiting: boolean;
  restored?: Framed;
  /** Frames without animating. */
  instant?: boolean;
  /** The search's toolbar lies over the map's top left, which the frame keeps clear of. */
  underToolbar?: boolean;
  /** Counts the visitor's asks to recentre, each of which frames the search again though nothing new has arrived. */
  recentres?: number;
  onFramed?: () => void;
};

// A margin on every side, and at the top room for the search box and filters where they lie over the map.
const MARGIN = 48;
const TOOLBAR_TOP = 136;
// Close enough to tell streets apart, even when every pin is at the centre.
const MAX_ZOOM = 14;

/**
 * Frames each search as its first page is placed, and again whenever Load more places further therapists or the visitor
 * asks to recentre: around the centre and every pin, or the whole area searched when no pin is placed. With no centre
 * it frames the pins alone. A pin moving, as to an office's postcode, frames nothing again. A view restored on Back is
 * left as it was until therapists are placed beyond those it had, or the visitor asks.
 * `onFramed` hears when the view is where the search puts it, or that there is nothing to frame.
 */
export function FitView({ fitKey, centre, points, placed, waiting, restored, instant, underToolbar = false, recentres = 0, onFramed }: Props) {
  const map = useMap();
  const framed = useRef(restored);
  const recentred = useRef(recentres);
  useEffect(() => {
    const last = framed.current;
    const taken = recentres === recentred.current && last?.fitKey === fitKey && placed <= last.placed;
    if (waiting || taken) return;
    recentred.current = recentres;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    if (centre) bounds.extend(points.length > 0 ? L.latLng(centre) : L.latLng(centre).toBounds(2 * SEARCH_MILES * METRES_PER_MILE));
    const top = underToolbar ? TOOLBAR_TOP : MARGIN;
    const options: L.FitBoundsOptions = { paddingTopLeft: [MARGIN, top], paddingBottomRight: [MARGIN, MARGIN], maxZoom: MAX_ZOOM };
    // Only ever false: an explicit true would animate even a pan across the country.
    if (instant) options.animate = false;
    if (!bounds.isValid()) {
      onFramed?.();
      return;
    }
    // Leaflet ends every fit with a moveend, at once or when an animation comes to rest, even when the view stays put.
    if (onFramed) map.once("moveend", onFramed);
    map.fitBounds(bounds, options);
    framed.current = { fitKey, placed };
  }, [map, fitKey, centre, points, placed, waiting, instant, underToolbar, recentres, onFramed]);
  return null;
}
