import type L from "leaflet";
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { useMap } from "react-leaflet";
import { useNavigate } from "react-router";
import { MapMarker, MapMarkerClusterGroup, MapTooltip, markerData } from "@/components/ui/map";
import { useProfileLink } from "@/profile/profileLink";
import type { Highlight } from "./highlight";
import { pinIcon } from "./pinIcon";
import type { Pin } from "./pins";

type Props = { pins: Pin[]; highlight: Highlight; selected?: Pin; onSelect: (pin: Pin) => void };

/** Who is on a pin, identifying its membership alongside its place. */
function who(pin: Pin): string {
  return pin.therapists.map((t) => t.slug).join(" ");
}

/**
 * Therapists' pins, merged into clusters as the map zooms out. A highlighted therapist's pin, or the cluster holding it,
 * is ringed and raised; so is the selected pin, with a halo.
 */
export function PinsLayer({ pins, highlight, selected, onSelect }: Props) {
  const cluster = useRef<L.MarkerClusterGroup>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const slug = useSyncExternalStore(highlight.subscribe, highlight.get);
  useMarkedPin(cluster, markers.current, slug, "pin-highlight", pins);
  useMarkedPin(cluster, markers.current, selected?.therapists[0]?.slug, "pin-selected", pins);
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

const MARKS = ["pin-highlight", "pin-selected"] as const;

/** Keeps `className` on whichever pin or cluster shows the marker for `slug`, as zooming and panning redraw them. */
function useMarkedPin(
  cluster: RefObject<L.MarkerClusterGroup | null>,
  markers: Map<string, L.Marker>,
  slug: string | undefined,
  className: (typeof MARKS)[number],
  pins: Pin[],
) {
  const map = useMap();
  useEffect(() => {
    const group = cluster.current;
    if (slug === undefined || !group) return;
    let marked: { layer: L.Marker; element: HTMLElement } | undefined;
    const unmark = () => {
      if (!marked) return;
      const { layer, element } = marked;
      element.classList.remove(className);
      // Kept raised while the other mark is on it.
      if (!MARKS.some((mark) => element.classList.contains(mark))) layer.setZIndexOffset(0);
      marked = undefined;
    };
    const mark = () => {
      unmark();
      const marker = markers.get(slug);
      const shown = marker && (group.getVisibleParent(marker) as L.Marker | null);
      const element = shown?.getElement();
      if (!shown || !element) return;
      element.classList.add(className);
      shown.setZIndexOffset(1000);
      marked = { layer: shown, element };
    };
    // The cluster group adds new markers a microtask after React does, so the first mark waits for them.
    let live = true;
    queueMicrotask(() => live && mark());
    group.on("animationend", mark);
    map.on("moveend", mark);
    return () => {
      live = false;
      group.off("animationend", mark);
      map.off("moveend", mark);
      unmark();
    };
  }, [cluster, markers, map, slug, className, pins]);
}

function TherapistPin({ pin, markers, onSelect }: { pin: Pin; markers: Map<string, L.Marker>; onSelect: (pin: Pin) => void }) {
  const navigate = useNavigate();
  const profile = useProfileLink();
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
  const activate = (event: L.LeafletMouseEvent) => {
    // The second click of a double-click, which would clear the selection its first click made.
    if (event.originalEvent.detail > 1) return;
    // Where the pointer can hover, the tooltip has already said who this is.
    if (only && window.matchMedia("(hover: hover)").matches) {
      const { to, state } = profile(only.slug);
      navigate(to, { state });
    } else onSelect(pin);
  };
  return (
    // No title: the icon names the marker, and a title would add the browser's own tooltip to this one.
    <MapMarker position={position} icon={icon} data={pin} ref={register} eventHandlers={{ click: activate }}>
      <MapTooltip>{only ? [only.name, only.location].filter(Boolean).join(" · ") : `${pin.therapists.length} therapists here`}</MapTooltip>
    </MapMarker>
  );
}
