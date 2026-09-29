import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L, { type DivIcon, type LatLngExpression, type Map as LeafletMap, type Marker, type MarkerCluster, type MarkerClusterGroupOptions } from "leaflet";
import type {} from "leaflet.markercluster";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react";
import {
  Circle,
  MapContainer,
  Marker as LeafletMarker,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
  type CircleProps,
  type MapContainerProps,
  type MarkerProps,
  type TileLayerProps,
  type TooltipProps,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { Button } from "@/components/ui/button";
import { useDarkTheme } from "@/layout/useDarkTheme";
import { cn } from "@/lib/utils";

// Derived from shadcn-map (https://shadcn-map.vercel.app), keeping only the parts this site uses. It has no
// lazy-loading wrappers for server rendering: the pane that imports it is itself loaded on demand.

function Map({
  className,
  zoom = 6,
  maxZoom = 18,
  children,
  ...props
}: Omit<MapContainerProps, "zoomControl"> & { center: LatLngExpression; ref?: Ref<LeafletMap> }) {
  return (
    <MapContainer zoom={zoom} maxZoom={maxZoom} zoomControl={false} className={cn("size-full", className)} {...props}>
      <FollowSize />
      <DataCreditsOnly />
      {children}
    </MapContainer>
  );
}

/** Leaflet measures its container once; a panel opening beside the map resizes it without resizing the window. */
function FollowSize() {
  const map = useMap();
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/** The credits name the map's data alone, and do so before any tiles are drawn. */
function DataCreditsOnly() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl?.setPrefix(false);
  }, [map]);
  return null;
}

export type TileSource = { url: string; attribution: string };

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** CARTO's tiles need a key; without one, as in development and CI, OpenStreetMap's own light tiles stand in. */
function tileSource(cartoKey: string | undefined, dark = false): TileSource {
  if (!cartoKey) return { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: OSM_ATTRIBUTION };
  return {
    // CARTO's documented form: one host, which HTTP/2 serves over a single connection.
    url: `https://basemaps.cartocdn.com/rastertiles/${dark ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
    attribution: `${OSM_ATTRIBUTION}, &copy; <a href="https://carto.com/attributions">CARTO</a>`,
  };
}

function MapTileLayer(props: Omit<TileLayerProps, "url" | "attribution">) {
  const dark = useDarkTheme();
  const { url, attribution } = tileSource(import.meta.env.VITE_CARTO_KEY, dark);
  // Keyed by URL, so a theme change swaps the layer rather than relying on Leaflet to redraw it in place.
  return <TileLayer key={url} url={url} attribution={attribution} {...props} />;
}

/** `data` rides along in the Leaflet marker's options, so a cluster can tell what its markers stand for. */
function MapMarker({ data, ...props }: MarkerProps & { data?: unknown; ref?: Ref<Marker> }) {
  const options = { ...props, data };
  return <LeafletMarker riseOnHover {...options} />;
}

function markerData<T>(marker: Marker): T | undefined {
  return (marker.options as { data?: T }).data;
}

/** Leaflet creates and discards marker icons itself as clusters change, so icons are plain DOM rather than React. */
function elementIcon(html: HTMLElement, [width, height]: [number, number]): DivIcon {
  return L.divIcon({
    html,
    className: "",
    iconSize: [width, height],
    iconAnchor: [width / 2, height / 2],
    tooltipAnchor: [0, -height / 2],
  });
}

function MapMarkerClusterGroup({
  icon,
  ...props
}: Omit<MarkerClusterGroupOptions, "iconCreateFunction"> & {
  children: ReactNode;
  icon?: (markers: Marker[]) => DivIcon;
  ref?: Ref<L.MarkerClusterGroup>;
}) {
  return (
    <MarkerClusterGroup
      showCoverageOnHover={false}
      spiderfyOnMaxZoom={false}
      iconCreateFunction={icon ? (cluster: MarkerCluster) => icon(cluster.getAllChildMarkers()) : undefined}
      {...props}
    />
  );
}

function MapCircle({ className, ...props }: CircleProps & { ref?: Ref<L.Circle> }) {
  return <Circle className={cn("fill-primary stroke-primary stroke-2", className)} {...props} />;
}

function MapTooltip({ className, ...props }: TooltipProps & { ref?: Ref<L.Tooltip> }) {
  return <Tooltip direction="top" opacity={1} className={cn("w-fit text-xs", className)} {...props} />;
}

function MapZoomControl({ className }: { className?: string }) {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  return (
    <MapControlContainer className={cn("top-2 left-2", className)}>
      <div role="group" aria-label="Zoom" className="flex flex-col gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          className="border"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= map.getMaxZoom()}
          onClick={() => map.zoomIn()}
        >
          <PlusIcon />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          className="border"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= map.getMinZoom()}
          onClick={() => map.zoomOut()}
        >
          <MinusIcon />
        </Button>
      </div>
    </MapControlContainer>
  );
}

/** A control drawn over the map; clicks and scrolls on it stay off the map beneath. */
function MapControlContainer({ className, ...props }: ComponentProps<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
  }, []);
  return <div ref={ref} className={cn("absolute z-1000 size-fit cursor-default", className)} {...props} />;
}

export { Map, MapCircle, MapControlContainer, MapMarker, MapMarkerClusterGroup, MapTileLayer, MapTooltip, MapZoomControl, elementIcon, markerData, tileSource };
