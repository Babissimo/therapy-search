import type { Map as LeafletMap } from "leaflet";
import { Focus, Loader2, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useMap } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { MapControlContainer } from "@/components/ui/map";
import { usePostcodeNear } from "../usePostcodeNear";
import { movedElsewhere, type Point, type View } from "./geo";

// Each fits one line above the buttons on a phone.
export const NO_POSTCODE_HERE = "No postcode near here. Move the map nearer a town.";
export const AREA_UNKNOWN = "Couldn't look up this area just now. Try again.";
export const ALREADY_SEARCHED = "This is the area already searched.";

type Props = {
  /** The search's own place, if it has one, which zooming in on is no move to somewhere else. */
  centre?: Point;
  /** False while a search is on its way, whose results will frame the map afresh. */
  settled: boolean;
  /** How much of the map's bottom, in pixels, lies under something laid over it, given the map's height. */
  coveredBelow?: (height: number) => number;
  /** Searches at the postcode, answering false when it is the one already searched. */
  onSearch: (postcode: string) => boolean;
  /** Frames the search again; absent when there is nothing to frame. */
  onRecentre?: () => void;
};

/**
 * Once the visitor moves the map from where the search framed it to somewhere a search could mean, offers a search at
 * the postcode nearest the middle of the map in view, and to frame the search again. It measures the move from the
 * view it mounts on, so its owner mounts it afresh as each search is framed.
 */
export function MovedMapButtons({ centre, settled, coveredBelow, onSearch, onRecentre }: Props) {
  const near = usePostcodeNear((postcode) => (onSearch(postcode) ? undefined : ALREADY_SEARCHED), {
    none: NO_POSTCODE_HERE,
    failed: () => AREA_UNKNOWN,
  });
  const map = useMap();
  const [framed] = useState(() => viewOf(map));
  const [seen, see] = useState(framed);
  // Gone at once, rather than as the map glides back: the framing that recentring starts mounts this afresh.
  const [recentred, recentre] = useState(false);
  const { dismiss } = near;
  // Subscribed for as long as it is mounted: listening afresh on each render would miss a move made in between.
  useEffect(() => {
    const moved = () => {
      see(viewOf(map));
      dismiss();
    };
    map.on("moveend", moved);
    return () => void map.off("moveend", moved);
  }, [map, dismiss]);
  // Going as the search or framing it starts gets under way, a button hands focus to the map rather than dropping it.
  // The same function on every render, so only a button's going runs its cleanup.
  const handFocus = useCallback(
    (button: HTMLButtonElement | null) => () => {
      if (button && document.activeElement === button) map.getContainer().focus();
    },
    [map],
  );
  if (!settled || recentred) return null;
  const covered = coveredBelow?.(map.getSize().y) ?? 0;
  // Read as the map lies now, since raising the sheet re-aims the part in view without a move.
  if (!movedElsewhere(seen, framed, middleInView(map, covered), centre)) return null;
  return (
    // Level with the zoom buttons on a wide screen; on a phone, above the sheet, gliding as it does. A resize, which
    // moves the sheet's top, ends with a moveend, which renders this again.
    <div
      className="pointer-events-none absolute inset-x-3 z-1000 flex justify-center transition-[bottom] duration-200"
      style={{ bottom: `calc(${covered}px + 2rem)` }}
    >
      <MapControlContainer className="pointer-events-auto relative flex flex-col items-center gap-1.5">
        {near.problem && (
          <p role="alert" className="rounded-md bg-background px-2 py-1 text-xs text-destructive shadow-md">
            {near.problem}
          </p>
        )}
        {/* A pill however many buttons it holds, overriding the group's own rounding of its last one. */}
        <ButtonGroup className="rounded-full shadow-md [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-full!">
          <Button
            ref={handFocus}
            type="button"
            variant="outline"
            className="rounded-full px-3 dark:bg-background"
            // Not disabled while looking, which would drop focus; a second press is ignored.
            aria-disabled={near.looking}
            onClick={() => near.lookNear(() => Promise.resolve(middleInView(map, covered)))}
          >
            {near.looking ? <Loader2 aria-hidden className="animate-spin" /> : <Search aria-hidden />}
            Search this area
          </Button>
          {onRecentre && (
            <Button
              ref={handFocus}
              type="button"
              variant="outline"
              className="rounded-full px-3 dark:bg-background"
              // The search under way would move the map again as it arrives, so this waits for it.
              aria-disabled={near.looking}
              onClick={() => {
                if (near.looking) return;
                recentre(true);
                onRecentre();
              }}
            >
              <Focus aria-hidden />
              Recentre
            </Button>
          )}
        </ButtonGroup>
        <p aria-live="polite" className="sr-only">
          {near.looking ? "Finding the nearest postcode" : ""}
        </p>
      </MapControlContainer>
    </div>
  );
}

// The whole map, rather than the part in view, so that raising or lowering what covers it is no move.
function viewOf(map: LeafletMap): View {
  const bounds = map.getBounds();
  return { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() };
}

/** The middle of the part of the map in view, above the `covered` pixels at its bottom. */
function middleInView(map: LeafletMap, covered: number): Point {
  const { x, y } = map.getSize();
  const { lat, lng } = map.containerPointToLatLng([x / 2, (y - covered) / 2]);
  return { lat, lng };
}
