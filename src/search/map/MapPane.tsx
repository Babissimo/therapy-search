import { useMapEvents } from "react-leaflet";
import { Map, MapCircle, MapTileLayer, MapZoomControl } from "@/components/ui/map";
import { savedView, saveView } from "../viewMemory";
import { FitView } from "./FitView";
import { METRES_PER_MILE, type Point } from "./geo";
import type { Highlight } from "./highlight";
import type { Pin } from "./pins";
import { PinsLayer } from "./PinsLayer";

const UK: [number, number] = [54.5, -3];

export type MapPaneProps = {
  /** The search as a query string: a new one frames the map afresh. */
  fitKey: string;
  /** The history entry the view is remembered against. */
  entry: string;
  centre?: Point;
  centreSettled: boolean;
  radiusMiles: number;
  pins: Pin[];
  /** True while any loaded card's location is still being looked up. */
  placing: boolean;
  /** The store of the therapist whose card is hovered or focused, which the pins subscribe to. */
  highlight: Highlight;
  onSelect: (pin: Pin) => void;
};

/** The map behind the results: pins, the distance circle, framed once per search, with the view kept for Back. */
export default function MapPane({ fitKey, entry, centre, centreSettled, radiusMiles, pins, placing, highlight, onSelect }: MapPaneProps) {
  const saved = savedView(entry).map;
  const restored = saved?.fitKey === fitKey ? saved : undefined;
  return (
    <div role="region" aria-label="Map of results" className="isolate size-full">
      <Map center={restored?.centre ?? UK} zoom={restored?.zoom ?? 5}>
        <MapTileLayer />
        <MapZoomControl className="top-auto right-2 bottom-8 left-auto max-lg:hidden" />
        {centre && (
          <MapCircle center={[centre.lat, centre.lng]} radius={radiusMiles * METRES_PER_MILE} pathOptions={{ fillOpacity: 0.06, dashArray: "6 6" }} />
        )}
        <PinsLayer pins={pins} highlight={highlight} onSelect={onSelect} />
        {/* Without a centre the pins set the frame, so it waits until the first cards are placed. */}
        <FitView
          fitKey={fitKey}
          centre={centre}
          radiusMiles={radiusMiles}
          points={pins.map((p) => p.point)}
          waiting={!centreSettled || (centre === undefined && placing)}
          restoredFor={restored?.fitKey}
        />
        <RememberView entry={entry} fitKey={fitKey} />
      </Map>
    </div>
  );
}

function RememberView({ entry, fitKey }: { entry: string; fitKey: string }) {
  const map = useMapEvents({
    moveend: () => {
      const { lat, lng } = map.getCenter();
      saveView(entry, { map: { fitKey, centre: [lat, lng], zoom: map.getZoom() } });
    },
  });
  return null;
}
