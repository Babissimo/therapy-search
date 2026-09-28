import L from "leaflet";
import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import { METRES_PER_MILE, type Point } from "./geo";

type Props = { fitKey: string; centre?: Point; radiusMiles: number; points: Point[]; waiting: boolean; restoredFor?: string };

/**
 * Frames each search once: its distance circle when there is a centre, otherwise its pins. Loading more never
 * refits, and a view restored on Back for the same search is left as it was.
 */
export function FitView({ fitKey, centre, radiusMiles, points, waiting, restoredFor }: Props) {
  const map = useMap();
  const fitted = useRef(restoredFor);
  useEffect(() => {
    if (waiting || fitted.current === fitKey) return;
    if (centre) map.fitBounds(L.latLng(centre).toBounds(2 * radiusMiles * METRES_PER_MILE));
    else if (points.length > 0) map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { maxZoom: 13, padding: [32, 32] });
    else return;
    fitted.current = fitKey;
  }, [map, fitKey, centre, radiusMiles, points, waiting]);
  return null;
}
