import { useMapEvents } from "react-leaflet";
import { SEARCH_MILES } from "@shared/query";
import { Map, MapCircle, MapTileLayer, MapZoomControl } from "@/components/ui/map";
import { savedView, saveView } from "../viewMemory";
import { FitView } from "./FitView";
import { METRES_PER_MILE, type Point } from "./geo";

const UK: [number, number] = [54.5, -3];

export type MapPaneProps = {
  /** The search as a query string: a new one frames the map afresh. */
  fitKey: string;
  /** The history entry the view is remembered against. */
  entry: string;
  centre?: Point;
  centreSettled: boolean;
};

/** The map behind the results: the area searched, framed once per search, with the view kept for Back. */
export default function MapPane({ fitKey, entry, centre, centreSettled }: MapPaneProps) {
  const saved = savedView(entry).map;
  const restored = saved?.fitKey === fitKey ? saved : undefined;
  return (
    <div role="region" aria-label="Map of results" className="isolate size-full">
      <Map center={restored?.centre ?? UK} zoom={restored?.zoom ?? 5}>
        <MapTileLayer />
        <MapZoomControl className="top-auto right-2 bottom-8 left-auto max-lg:hidden" />
        {centre && (
          // Blue, which shows on light and dark tiles alike.
          <MapCircle
            center={[centre.lat, centre.lng]}
            radius={SEARCH_MILES * METRES_PER_MILE}
            className="fill-sky-500 stroke-sky-500"
            pathOptions={{ fillOpacity: 0.06, dashArray: "6 6" }}
          />
        )}
        <FitView fitKey={fitKey} centre={centre} points={[]} waiting={!centreSettled} restored={restored} />
        <RememberView entry={entry} fitKey={fitKey} pins={0} />
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
