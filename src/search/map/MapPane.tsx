import { useReducer, useState } from "react";
import { useMapEvents } from "react-leaflet";
import { Map, MapBounds, MapMarker, MapTileLayer, MapZoomControl } from "@/components/ui/map";
import { savedView, saveView } from "../viewMemory";
import { FitView } from "./FitView";
import { UK_BOUNDS, UK_VIEW, type Point } from "./geo";
import type { Highlight } from "./highlight";
import { MovedMapButtons } from "./MovedMapButtons";
import { centreIcon } from "./pinIcon";
import type { Pin } from "./pins";
import { PinsLayer } from "./PinsLayer";

export type MapPaneProps = {
  /** Names what the map shows, for screen readers. */
  label: string;
  /** What the map shows, as a key: a new one frames the map afresh. */
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
  /** The pin whose place the results list marks. */
  selected?: Pin;
  onSelect: (pin: Pin) => void;
  /** Searches at the postcode nearest the middle of the map, answering false when it is the one already searched. */
  onSearchArea: (postcode: string) => boolean;
  /** The search reads its location as a place anywhere in the world, so the map isn't kept to the UK. */
  outsideUK?: boolean;
  /** How much of the map's bottom, in pixels, lies under the results, given the map's height. */
  coveredBelow?: (height: number) => number;
};

/** The map behind the side bar: the open list's pins, with the search's centre, framed as they are placed, with the view kept for Back. */
export default function MapPane({
  label,
  fitKey,
  entry,
  centre,
  centreSettled,
  pins,
  placing,
  highlight,
  selected,
  onSelect,
  onSearchArea,
  outsideUK,
  coveredBelow,
}: MapPaneProps) {
  const saved = savedView(entry).map;
  const restored = saved?.fitKey === fitKey ? saved : undefined;
  // A search keeps its tiles back until it is framed, so the whole UK's aren't fetched on the way. A view restored on
  // Back is already where it will stay.
  const [tiles, showTiles] = useState(restored !== undefined);
  const [centrePin] = useState(centreIcon);
  const [framings, countFraming] = useReducer((count: number) => count + 1, 0);
  const [recentres, recentre] = useReducer((count: number) => count + 1, 0);
  // The frame takes in every loaded pin, so it waits until they are placed.
  const framing = !centreSettled || placing;
  const points = pins.map((p) => p.point);
  const bounds = outsideUK ? undefined : UK_BOUNDS;
  return (
    <div role="region" aria-label={label} className="isolate size-full">
      <Map center={restored?.centre ?? UK_VIEW.centre} zoom={restored?.zoom ?? UK_VIEW.zoom}>
        {/* Tiles stop at the bounds, which a view wider or taller than them reaches past. */}
        {tiles && <MapTileLayer bounds={bounds} />}
        <MapBounds bounds={bounds} />
        <MapZoomControl className="top-auto right-2 bottom-8 left-auto max-lg:hidden" />
        {/* Above the therapists' pins, which often share its point, but beneath one hovered (index.css raises it above
            every marker) or marked (PinsLayer raises it 1000); it lets clicks through to them. */}
        {centre && <MapMarker position={[centre.lat, centre.lng]} icon={centrePin} interactive={false} keyboard={false} zIndexOffset={200} />}
        <PinsLayer pins={pins} highlight={highlight} selected={selected} onSelect={onSelect} />
        <FitView
          fitKey={fitKey}
          centre={centre}
          points={points}
          waiting={framing}
          restored={restored}
          // With no tiles drawn there is nothing to animate across, and they should load where the frame lands.
          instant={!tiles}
          coveredBelow={coveredBelow}
          recentres={recentres}
          onFramed={() => {
            showTiles(true);
            countFraming();
          }}
        />
        {/* Mounted afresh on each frame, which it measures the visitor's moves from, and waiting as the frame does. */}
        <MovedMapButtons
          key={framings}
          centred={centre !== undefined}
          settled={!framing}
          coveredBelow={coveredBelow}
          onSearch={onSearchArea}
          onRecentre={centre || pins.length > 0 ? recentre : undefined}
        />
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
