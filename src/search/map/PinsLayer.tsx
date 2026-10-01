import type L from "leaflet";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMap } from "react-leaflet";
import { useNavigate } from "react-router";
import { MapMarker, MapMarkerClusterGroup, MapTooltip, markerData } from "@/components/ui/map";
import { useStore } from "@/lib/store";
import { useProfileLink } from "@/profile/profileLink";
import { useShortlistedSlugs } from "@/shortlist/useShortlist";
import type { Highlight } from "./highlight";
import { pinIcon } from "./pinIcon";
import type { Pin } from "./pins";

type Props = {
  pins: Pin[];
  highlight: Highlight;
  selected?: Pin;
  onSelect: (pin: Pin) => void;
  /** Lets the selected pin go, as the pointer leaves it. */
  onDeselect?: () => void;
  /** Badges and raises the pins of shortlisted therapists not set aside, which a map of the shortlist alone has no need to. */
  marksShortlist?: boolean;
};

// Above other therapists' pins, but beneath the search's centre (MapPane) and a marked pin.
const SHORTLISTED_Z = 100;

/** Who is on a pin, identifying its membership alongside its place. */
function who(pin: Pin): string {
  return pin.therapists.map((t) => t.slug).join(" ");
}

/**
 * Therapists' pins, merged into clusters as the map zooms out. A highlighted therapist's pin, or the cluster holding it,
 * is ringed and raised; so is the selected pin, with a halo.
 */
export function PinsLayer({ pins, highlight, selected, onSelect, onDeselect, marksShortlist = false }: Props) {
  const cluster = useRef<L.MarkerClusterGroup>(null);
  const markers = useRef(new Map<string, L.Marker>());
  const slug = useStore(highlight);
  const shortlisted = useShortlistedSlugs(marksShortlist);
  // Before the marks, which a redrawn icon has lost.
  useRedrawnClusters(cluster, markers.current, shortlisted);
  useMarkedPin(cluster, markers.current, slug, "pin-highlight", pins, shortlisted);
  useMarkedPin(cluster, markers.current, selected?.therapists[0]?.slug, "pin-selected", pins, shortlisted);
  useHeldWhileHovered(cluster, markers.current, selected?.therapists[0]?.slug, pins, onDeselect);
  return (
    <MapMarkerClusterGroup
      ref={cluster}
      icon={(inCluster) => pinIcon(inCluster.flatMap((m) => markerData<Pin>(m)?.therapists ?? []), shortlisted)}
      maxClusterRadius={60}
      disableClusteringAtZoom={16}
    >
      {pins.map((pin) => (
        // Leaflet reads a marker's title and data only when it is created, so a change of membership needs a fresh one.
        <TherapistPin key={`${pin.key} ${who(pin)}`} pin={pin} shortlisted={shortlisted} markers={markers.current} onSelect={onSelect} />
      ))}
    </MapMarkerClusterGroup>
  );
}

/** Redraws the clusters holding anyone who joins or leaves those picked out (the shortlist less those set aside); their own pins redraw themselves. */
function useRedrawnClusters(cluster: RefObject<L.MarkerClusterGroup | null>, markers: Map<string, L.Marker>, shortlisted: ReadonlySet<string>) {
  const last = useRef(shortlisted);
  useEffect(() => {
    const before = last.current;
    last.current = shortlisted;
    const moved = [...before, ...shortlisted].filter((slug) => before.has(slug) !== shortlisted.has(slug));
    const changed = [...new Set(moved.flatMap((slug) => markers.get(slug) ?? []))];
    if (changed.length > 0) cluster.current?.refreshClusters(changed);
  }, [cluster, markers, shortlisted]);
}

/** A pin holding a therapist picked out rests raised; a cluster, with no therapists of its own, rests level. */
function restingZ(therapists: Pin["therapists"] | undefined, shortlisted: ReadonlySet<string>): number {
  return therapists?.some((t) => shortlisted.has(t.slug)) ? SHORTLISTED_Z : 0;
}

const MARKS = ["pin-highlight", "pin-selected"] as const;

/** Keeps `className` on whichever pin or cluster shows the marker for `slug`, as zooming and panning redraw them. */
function useMarkedPin(
  cluster: RefObject<L.MarkerClusterGroup | null>,
  markers: Map<string, L.Marker>,
  slug: string | undefined,
  className: (typeof MARKS)[number],
  pins: Pin[],
  shortlisted: ReadonlySet<string>,
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
      if (!MARKS.some((mark) => element.classList.contains(mark))) layer.setZIndexOffset(restingZ(markerData<Pin>(layer)?.therapists, shortlisted));
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
  }, [cluster, markers, map, slug, className, pins, shortlisted]);
}

/**
 * Where the pointer can hover, a pin stays selected only while the pointer is on it: moving off it, or zooming out until a
 * cluster gathers it in, lets it go. A touch screen's tap elsewhere ends a hover it only pretended, so there it stays.
 */
function useHeldWhileHovered(
  cluster: RefObject<L.MarkerClusterGroup | null>,
  markers: Map<string, L.Marker>,
  slug: string | undefined,
  pins: Pin[],
  onDeselect: (() => void) | undefined,
) {
  const map = useMap();
  useEffect(() => {
    const group = cluster.current;
    const marker = slug === undefined ? undefined : markers.get(slug);
    if (!group || !marker || !onDeselect || !canHover()) return;
    const leave = () => onDeselect();
    const gathered = () => {
      if (group.getVisibleParent(marker) !== marker) onDeselect();
    };
    marker.on("mouseout", leave);
    group.on("animationend", gathered);
    map.on("moveend", gathered);
    return () => {
      marker.off("mouseout", leave);
      group.off("animationend", gathered);
      map.off("moveend", gathered);
    };
  }, [cluster, markers, map, slug, pins, onDeselect]);
}

const canHover = () => window.matchMedia("(hover: hover)").matches;

type TherapistPinProps = { pin: Pin; shortlisted: ReadonlySet<string>; markers: Map<string, L.Marker>; onSelect: (pin: Pin) => void };

function TherapistPin({ pin, shortlisted, markers, onSelect }: TherapistPinProps) {
  const navigate = useNavigate();
  const profile = useProfileLink();
  // Fresh only for the life of this marker (the key above remounts it for any change of place or membership), so
  // re-renders, such as another card being hovered, keep Leaflet's marker, icon and position rather than re-clustering it.
  const [position] = useState<[number, number]>(() => [pin.point.lat, pin.point.lng]);
  const [therapists] = useState(pin.therapists);
  // Drawn afresh, and swapped in by Leaflet, only as this pin's own therapists join or leave those picked out.
  const listed = therapists.filter((t) => shortlisted.has(t.slug)).map((t) => t.slug).join(" ");
  const icon = useMemo(() => pinIcon(therapists, new Set(listed.split(" "))), [therapists, listed]);
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
    if (only && canHover()) {
      const { to, state } = profile(only.slug);
      navigate(to, { state });
    } else onSelect(pin);
  };
  return (
    // No title: the icon names the marker, and a title would add the browser's own tooltip to this one.
    <MapMarker
      position={position}
      icon={icon}
      zIndexOffset={restingZ(therapists, shortlisted)}
      data={pin}
      ref={register}
      eventHandlers={{ click: activate }}
    >
      {/* Lifted clear of the pin, which grows under the pointer (index.css). */}
      <MapTooltip offset={[0, -10]}>{only ? [only.name, only.location].filter(Boolean).join(" · ") : `${pin.therapists.length} therapists here`}</MapTooltip>
    </MapMarker>
  );
}
