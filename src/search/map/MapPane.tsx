import { useMapEvents } from "react-leaflet";
import { Map, MapCircle, MapTileLayer, MapZoomControl } from "@/components/ui/map";
import { savedView, saveView } from "../viewMemory";
import { FitView } from "./FitView";
import { furthestMiles, METRES_PER_MILE, type Point } from "./geo";
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
  pins: Pin[];
  /** True while any loaded card's location is still being looked up. */
  placing: boolean;
  /** The store of the therapist whose card is hovered or focused, which the pins subscribe to. */
  highlight: Highlight;
  /** The pin whose therapists the results show "At this pin". */
  selected?: Pin;
  onSelect: (pin: Pin) => void;
};

/** The map behind the results: pins and the circle they reach, framed as they are placed, with the view kept for Back. */
export default function MapPane({ fitKey, entry, centre, centreSettled, pins, placing, highlight, selected, onSelect }: MapPaneProps) {
  const saved = savedView(entry).map;
  const restored = saved?.fitKey === fitKey ? saved : undefined;
  const points = pins.map((p) => p.point);
  // Measured to the pins: UKCP measures from the middle of the town a therapist lists, putting a whole town 0 miles away.
  const reachMiles = centre && furthestMiles(centre, points);
  return (
    <div role="region" aria-label="Map of results" className="isolate size-full">
      <Map center={restored?.centre ?? UK} zoom={restored?.zoom ?? 5}>
        <MapTileLayer />
        <MapZoomControl className="top-auto right-2 bottom-8 left-auto max-lg:hidden" />
        {centre && reachMiles !== undefined && (
          // Blue, which shows on light and dark tiles alike.
          <MapCircle
            center={[centre.lat, centre.lng]}
            radius={reachMiles * METRES_PER_MILE}
            className="fill-sky-500 stroke-sky-500"
            pathOptions={{ fillOpacity: 0.06, dashArray: "6 6" }}
          />
        )}
        <PinsLayer pins={pins} highlight={highlight} selected={selected} onSelect={onSelect} />
        {/* The frame takes in every loaded pin, so it waits until they are placed. */}
        <FitView fitKey={fitKey} centre={centre} reachMiles={reachMiles} points={points} waiting={!centreSettled || placing} restored={restored} />
        <RememberView entry={entry} fitKey={fitKey} pins={pins.length} />
      </Map>
    </div>
  );
}

function RememberView({ entry, fitKey, pins }: { entry: string; fitKey: string; pins: number }) {
  const map = useMapEvents({
    moveend: () => {
      const { lat, lng } = map.getCenter();
      saveView(entry, { map: { fitKey, pins, centre: [lat, lng], zoom: map.getZoom() } });
    },
  });
  return null;
}
