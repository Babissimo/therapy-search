import { useMemo } from "react";
import type { Profile } from "@shared/types";
import { Map, MapMarker, MapTileLayer } from "@/components/ui/map";
import type { Point } from "@/search/map/geo";
import { pinIcon } from "@/search/map/pinIcon";

type Props = { profile: Profile; point: Point; zoom: number };

/** A still map around one of the therapist's offices, with their pin as the search's map draws it. */
export default function ProfileMap({ profile, point, zoom }: Props) {
  const centre = useMemo<[number, number]>(() => [point.lat, point.lng], [point.lat, point.lng]);
  // Built again only for a changed profile, as the marker redraws its pin, photo and all, for each new icon.
  const pin = useMemo(() => pinIcon([profile]), [profile]);
  return (
    <Map
      center={centre}
      zoom={zoom}
      dragging={false}
      touchZoom={false}
      doubleClickZoom={false}
      scrollWheelZoom={false}
      boxZoom={false}
      keyboard={false}
    >
      <MapTileLayer />
      <MapMarker position={centre} icon={pin} interactive={false} keyboard={false} />
    </Map>
  );
}
