import type { Map as LeafletMap } from "leaflet";
import { Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { MapControlContainer } from "@/components/ui/map";
import { usePostcodeNear } from "../usePostcodeNear";
import { movedElsewhere, type Point, type View } from "./geo";

// Each fits one line beneath the button on a phone.
export const NO_POSTCODE_HERE = "No postcode near here. Move the map nearer a town.";
export const AREA_UNKNOWN = "Couldn't look up this area just now. Try again.";
export const ALREADY_SEARCHED = "This is the area already searched.";

type Props = {
  /** Whether the search has a place of its own, which zooming in on is no move to somewhere else. */
  centred: boolean;
  /** False while a search is on its way, whose results will frame the map afresh. */
  settled: boolean;
  /** How much of the map's bottom, in pixels, lies under something laid over it, given the map's height. */
  coveredBelow?: (height: number) => number;
  /** Searches at the postcode, answering false when it is the one already searched. */
  onSearch: (postcode: string) => boolean;
};

/**
 * Offers a search at the postcode nearest the middle of the map in view, once the visitor moves the map somewhere a
 * search could mean. It measures the move from the view it mounts on, so its owner mounts it afresh as each search is
 * framed.
 */
export function SearchAreaButton({ centred, settled, coveredBelow, onSearch }: Props) {
  const near = usePostcodeNear((postcode) => (onSearch(postcode) ? undefined : ALREADY_SEARCHED), {
    none: NO_POSTCODE_HERE,
    failed: () => AREA_UNKNOWN,
  });
  const map = useMap();
  const [framed] = useState(() => viewOf(map));
  const [view, setView] = useState(framed);
  const { dismiss } = near;
  // Subscribed for as long as it is mounted: listening afresh on each render would miss a move made in between.
  useEffect(() => {
    const moved = () => {
      setView(viewOf(map));
      dismiss();
    };
    map.on("moveend", moved);
    return () => void map.off("moveend", moved);
  }, [map, dismiss]);
  // Going as the search it starts gets under way, it hands focus to the map rather than dropping it. The same function
  // on every render, so only the button's going runs its cleanup.
  const handFocus = useCallback(
    (button: HTMLButtonElement | null) => () => {
      if (button && document.activeElement === button) map.getContainer().focus();
    },
    [map],
  );
  if (!settled || !movedElsewhere(view, framed, centred)) return null;
  return (
    // Clear of SearchPage's toolbar, whose inset, width and row of filter chips these offsets follow: beneath it on a
    // phone, where it spans the map, and beside it on a wide screen.
    <div className="pointer-events-none absolute inset-x-3 top-40 z-1000 flex justify-center lg:top-5 lg:left-102">
      <MapControlContainer className="pointer-events-auto relative flex flex-col items-center gap-1.5">
        <Button
          ref={handFocus}
          type="button"
          variant="outline"
          className="rounded-full px-3 shadow-md dark:bg-background"
          // Not disabled while looking, which would drop focus; a second press is ignored.
          aria-disabled={near.looking}
          onClick={() => near.lookNear(() => Promise.resolve(middleInView(map, coveredBelow)))}
        >
          {near.looking ? <Loader2 aria-hidden className="animate-spin" /> : <Search aria-hidden />}
          Search this area
        </Button>
        <p aria-live="polite" className="sr-only">
          {near.looking ? "Finding the nearest postcode" : ""}
        </p>
        {near.problem && (
          <p role="alert" className="rounded-md bg-background px-2 py-1 text-xs text-destructive shadow-md">
            {near.problem}
          </p>
        )}
      </MapControlContainer>
    </div>
  );
}

// The whole map, rather than the part in view, so that raising or lowering what covers it is no move.
function viewOf(map: LeafletMap): View {
  const bounds = map.getBounds();
  return { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() };
}

function middleInView(map: LeafletMap, coveredBelow?: (height: number) => number): Point {
  const { x, y } = map.getSize();
  const { lat, lng } = map.containerPointToLatLng([x / 2, (y - (coveredBelow?.(y) ?? 0)) / 2]);
  return { lat, lng };
}
