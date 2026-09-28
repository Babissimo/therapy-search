import type L from "leaflet";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { MapMarker, MapMarkerClusterGroup, MapTooltip, markerData } from "@/components/ui/map";
import type { Highlight } from "./highlight";
import { pinIcon } from "./pinIcon";
import type { Pin } from "./pins";

type Props = { pins: Pin[]; highlight: Highlight; onSelect: (pin: Pin) => void };

/** Who is on a pin, identifying its membership alongside its place. */
function who(pin: Pin): string {
  return pin.therapists.map((t) => t.slug).join(" ");
}

/** Therapists' pins, merged into clusters as the map zooms out. A highlighted therapist's pin, or the cluster holding it, is ringed. */
export function PinsLayer({ pins, highlight, onSelect }: Props) {
  const cluster = useRef<L.MarkerClusterGroup>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const slug = useSyncExternalStore(highlight.subscribe, highlight.get);
  useEffect(() => {
    const marker = slug === undefined ? undefined : markers.current.get(slug);
    const shown = marker && (cluster.current?.getVisibleParent(marker) as L.Marker | null | undefined);
    const element = shown?.getElement();
    if (!shown || !element) return;
    element.classList.add("pin-highlight");
    shown.setZIndexOffset(1000);
    return () => {
      element.classList.remove("pin-highlight");
      shown.setZIndexOffset(0);
    };
  }, [slug, pins]);
  return (
    <MapMarkerClusterGroup
      ref={cluster}
      icon={(inCluster) => pinIcon(inCluster.flatMap((m) => markerData<Pin>(m)?.therapists ?? []))}
      maxClusterRadius={60}
      disableClusteringAtZoom={16}
    >
      {pins.map((pin) => (
        // Leaflet reads a marker's title and data only when it is created, so a change of membership needs a fresh one.
        <TherapistPin key={`${pin.key} ${who(pin)}`} pin={pin} markers={markers.current} onSelect={onSelect} />
      ))}
    </MapMarkerClusterGroup>
  );
}

function TherapistPin({ pin, markers, onSelect }: { pin: Pin; markers: Map<string, L.Marker>; onSelect: (pin: Pin) => void }) {
  const navigate = useNavigate();
  // Fresh only for the life of this marker (the key above remounts it for any change of place or membership), so
  // re-renders, such as another card being hovered, keep Leaflet's marker, icon and position rather than re-clustering it.
  const [position] = useState<[number, number]>(() => [pin.point.lat, pin.point.lng]);
  const [icon] = useState(() => pinIcon(pin.therapists));
  const only = pin.therapists.length === 1 ? pin.therapists[0] : undefined;
  const register = (marker: L.Marker | null) => {
    if (!marker) return;
    for (const t of pin.therapists) markers.set(t.slug, marker);
    return () => {
      for (const t of pin.therapists) if (markers.get(t.slug) === marker) markers.delete(t.slug);
    };
  };
  const activate = () => {
    // Where the pointer can hover, the tooltip has already said who this is.
    if (only && window.matchMedia("(hover: hover)").matches) navigate(`/therapist/${only.slug}`);
    else onSelect(pin);
  };
  return (
    // No title: the icon names the marker, and a title would add the browser's own tooltip to this one.
    <MapMarker position={position} icon={icon} data={pin} ref={register} eventHandlers={{ click: activate }}>
      <MapTooltip>{only ? [only.name, only.location].filter(Boolean).join(" · ") : `${pin.therapists.length} therapists here`}</MapTooltip>
    </MapMarker>
  );
}
