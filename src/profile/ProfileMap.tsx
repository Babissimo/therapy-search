import type { Profile } from "@shared/types";
import { Map, MapMarker, MapTileLayer } from "@/components/ui/map";
import type { Point } from "@/search/map/geo";
import { pinIcon } from "@/search/map/pinIcon";

type Props = { profile: Profile; point: Point; zoom: number };

/** A still map around one of the therapist's offices, with their pin as the search's map draws it. */
export default function ProfileMap({ profile, point, zoom }: Props) {
  const centre: [number, number] = [point.lat, point.lng];
  const pin = pinIcon([{ slug: profile.slug, name: profile.name, initials: profile.initials, photoUrl: profile.photoUrl, tags: [] }]);
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
