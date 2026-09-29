import { useMapEvents } from "react-leaflet";
import { Map, MapCircle, MapTileLayer, MapZoomControl } from "@/components/ui/map";
import { savedView, saveView } from "../viewMemory";
import { FitView } from "./FitView";
import { METRES_PER_MILE, UK_VIEW, type Point } from "./geo";
import type { Highlight } from "./highlight";
import type { Pin } from "./pins";
import { PinsLayer } from "./PinsLayer";

export type MapPaneProps = {
  /** The search as a query string: a new one frames the map afresh. Empty when nothing is searched. */
  fitKey: string;
  /** The history entry the view is remembered against. */
  entry: string;
  centre?: Point;
  /** The furthest of UKCP's distances among the loaded cards, which the circle reaches. */
  reachMiles?: number;
  centreSettled: boolean;
  pins: Pin[];
  /** True while any loaded card's location is still being looked up. */
  placing: boolean;
  /** The store of the therapist whose card is hovered or focused, which the pins subscribe to. */
  highlight: Highlight;
  /** The pin whose place the results list marks. */
  selected?: Pin;
  onSelect: (pin: Pin) => void;
};

/** The map behind the results: pins and the circle the list reaches, framed as they are placed, with the view kept for Back. */
export default function MapPane({ fitKey, entry, centre, reachMiles, centreSettled, pins, placing, highlight, selected, onSelect }: MapPaneProps) {
  const saved = savedView(entry).map;
  const restored = saved?.fitKey === fitKey ? saved : undefined;
  const points = pins.map((p) => p.point);
  return (
    <div role="region" aria-label="Map of results" className="isolate size-full">
      <Map center={restored?.centre ?? UK_VIEW.centre} zoom={restored?.zoom ?? UK_VIEW.zoom}>
        <MapTileLayer />
        <MapZoomControl className="top-auto right-2 bottom-8 left-auto max-lg:hidden" />
        {/* Pins mark only the district or town a card lists, so one can sit a little either side of the edge. */}
        {centre && reachMiles !== undefined && reachMiles > 0 && (
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
        <RememberView entry={entry} fitKey={fitKey} pins={pins.length} reach={reachMiles} />
      </Map>
    </div>
  );
}

function RememberView({ entry, fitKey, pins, reach }: { entry: string; fitKey: string; pins: number; reach?: number }) {
  const map = useMapEvents({
    moveend: () => {
      const { lat, lng } = map.getCenter();
      saveView(entry, { map: { fitKey, pins, reach, centre: [lat, lng], zoom: map.getZoom() } });
    },
  });
  return null;
}
