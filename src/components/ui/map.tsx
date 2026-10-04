import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import L, { type DivIcon, type LatLngBoundsLiteral, type LatLngExpression, type Map as LeafletMap, type Marker, type MarkerCluster, type MarkerClusterGroupOptions } from "leaflet";
import type {} from "leaflet.markercluster";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode, type Ref } from "react";
import {
  MapContainer,
  Marker as LeafletMarker,
  TileLayer,
  Tooltip,
  useMap,
  type MapContainerProps,
  type MarkerProps,
  type TileLayerProps,
  type TooltipProps,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { Button } from "@/components/ui/button";
import { useDarkTheme } from "@/layout/useDarkTheme";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";

// Derived from shadcn-map (https://shadcn-map.vercel.app), keeping only the parts this site uses. It has no
// lazy-loading wrappers for server rendering: the pane that imports it is itself loaded on demand.

function Map({
  className,
  zoom = 6,
  maxZoom = 18,
  sharedCredits = false,
  children,
  ...props
}: Omit<MapContainerProps, "zoomControl"> & {
  center: LatLngExpression;
  ref?: Ref<LeafletMap>;
  /** One of several maps on the page, whose credits keep one place in the Tab order between them (SharedCredits). */
  sharedCredits?: boolean;
}) {
  // Leaflet reads these once, as the map is made.
  const still = useReducedMotion();
  return (
    <MapContainer
      zoom={zoom}
      maxZoom={maxZoom}
      zoomControl={false}
      zoomAnimation={!still}
      fadeAnimation={!still}
      markerZoomAnimation={!still}
      inertia={!still}
      className={cn("size-full", className)}
      {...props}
    >
      <FollowSize />
      <DataCreditsOnly />
      {sharedCredits && <SharedCredits />}
      {still && <StillPans />}
      {children}
    </MapContainer>
  );
}

/** Whether the visitor asks for less motion, for maps to zoom, pan and split clusters without gliding. */
function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/** Leaflet glides any pan shorter than the map, such as an arrow key's, unless each call asks otherwise; no option stops it. */
function StillPans() {
  const map = useMap();
  useEffect(() => {
    const glide = map.panBy;
    map.panBy = (offset, options) => glide.call(map, offset, { ...options, animate: false });
    return () => {
      map.panBy = glide;
    };
  }, [map]);
  return null;
}

/** Leaflet measures its container once; a panel opening beside the map resizes it without resizing the window. */
function FollowSize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    // A hidden map, as on paper, keeps the size it had: a view fitted into no room has no zoom, which breaks the clusters.
    const observer = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0) map.invalidateSize();
    });
    observer.observe(container);
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

// The maps whose credits keep one place in the Tab order between them.
const sharing = new Set<HTMLElement>();

/** The first sharing map in the page's order keeps its credits' links in the Tab order; the others' leave it. */
function retab() {
  const maps = [...sharing].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  maps.forEach((container, i) => {
    for (const link of container.querySelectorAll(".leaflet-control-attribution a")) {
      if (i === 0) link.removeAttribute("tabindex");
      else link.setAttribute("tabindex", "-1");
    }
  });
}

/**
 * Every map shows its own credits, linked, as CARTO's terms ask of each basemap, but a page of several maps needs those
 * links in its Tab order once, the others naming the same pages.
 */
function SharedCredits() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    sharing.add(container);
    retab();
    // Leaflet rewrites the credits whenever a layer comes or goes: the tiles as they first load, and again with each theme.
    const observer = new MutationObserver(retab);
    const credits = map.attributionControl?.getContainer();
    if (credits) observer.observe(credits, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      sharing.delete(container);
      retab();
    };
  }, [map]);
  return null;
}

/** `dark` says whether the tiles are drawn dark, which their tint (index.css) follows. */
export type TileSource = { url: string; attribution: string; dark: boolean };

const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** CARTO's tiles need a key; without one, as in development and CI, OpenStreetMap's own light tiles stand in. */
function tileSource(cartoKey: string | undefined, dark = false): TileSource {
  if (!cartoKey) return { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: OSM_ATTRIBUTION, dark: false };
  return {
    // CARTO's documented form: one host, which HTTP/2 serves over a single connection.
    url: `https://basemaps.cartocdn.com/rastertiles/${dark ? "dark_all" : "light_all"}/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`,
    attribution: `${OSM_ATTRIBUTION}, &copy; <a href="https://carto.com/attribution/">CARTO</a>`,
    dark,
  };
}

function MapTileLayer(props: Omit<TileLayerProps, "url" | "attribution">) {
  const dark = useDarkTheme();
  const source = tileSource(import.meta.env.VITE_CARTO_KEY, dark);
  // Keyed by URL, so a theme change swaps the layer rather than relying on Leaflet to redraw it in place, and by bounds,
  // which a layer reads only as it is made.
  return (
    <TileLayer
      key={JSON.stringify([source.url, props.bounds])}
      url={source.url}
      attribution={source.attribution}
      className={source.dark ? "tiles-dark" : "tiles-light"}
      {...props}
    />
  );
}

/** `data` rides along in the Leaflet marker's options, so a cluster can tell what its markers stand for. */
function MapMarker({ data, ...props }: MarkerProps & { data?: unknown; ref?: Ref<Marker> }) {
  const options = { ...props, data };
  return <LeafletMarker {...options} />;
}

function markerData<T>(marker: Marker): T | undefined {
  return (marker.options as { data?: T }).data;
}

/**
 * Leaflet creates and discards marker icons itself as clusters change, so icons are plain DOM rather than React. An
 * icon is centred on its point, or with `stand: "tip"`, stands on it by the middle of its bottom edge.
 */
function elementIcon(html: HTMLElement, [width, height]: [number, number], stand: "centre" | "tip" = "centre"): DivIcon {
  const anchorY = stand === "tip" ? height : height / 2;
  return L.divIcon({
    html,
    className: "",
    iconSize: [width, height],
    iconAnchor: [width / 2, anchorY],
    tooltipAnchor: [0, -anchorY],
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
      animate={!useReducedMotion()}
      iconCreateFunction={icon ? (cluster: MarkerCluster) => icon(cluster.getAllChildMarkers()) : undefined}
      {...props}
    />
  );
}

function MapTooltip({ className, ...props }: TooltipProps & { ref?: Ref<L.Tooltip> }) {
  return <Tooltip direction="top" opacity={1} className={cn("w-fit text-xs", className)} {...props} />;
}

/** The furthest out a map can zoom and still show `limits` whole. */
function wholeZoom(map: LeafletMap, limits: L.LatLngBounds): number {
  const size = map.getSize();
  const span = map.project(limits.getSouthEast(), 0).subtract(map.project(limits.getNorthWest(), 0));
  return Math.max(0, Math.floor(Math.log2(Math.min(size.x / span.x, size.y / span.y))));
}

/**
 * Keeps the view within `bounds`, zooming out no further than shows them whole. Without bounds the map roams freely.
 * `bounds` is compared by identity, so pass a constant.
 */
function MapBounds({ bounds }: { bounds?: LatLngBoundsLiteral }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    const limits = L.latLngBounds(bounds);
    const { minZoom, maxBoundsViscosity } = map.options;
    // Unanimated, so a new map has settled before its other parts listen for moves.
    const showWhole = () => {
      // Never below the map's own minimum, so restoring that minimum can't move the view.
      const floor = Math.max(minZoom ?? 0, wholeZoom(map, limits));
      if (map.getZoom() < floor) map.setZoom(floor, { animate: false });
      map.setMinZoom(floor);
    };
    map.options.maxBoundsViscosity = 1;
    showWhole();
    map.panInsideBounds(limits, { animate: false });
    map.setMaxBounds(limits);
    map.on("resize", showWhole);
    return () => {
      map.off("resize", showWhole);
      map.setMaxBounds(undefined);
      map.setMinZoom(minZoom ?? 0);
      map.options.maxBoundsViscosity = maxBoundsViscosity;
    };
  }, [map, bounds]);
  return null;
}

const zoomLevels = (map: LeafletMap) => ({ zoom: map.getZoom(), min: map.getMinZoom(), max: map.getMaxZoom() });

// Secondary's slate matches the tinted tiles and vanishes into them, so over the map a button takes the toolbar's surface:
// the page's background, opaque in dark mode too, with a border and a shadow.
const OVER_TILES = "shadow-md dark:bg-background dark:hover:bg-muted";

function MapZoomControl({ className }: { className?: string }) {
  const map = useMap();
  const [{ zoom, min, max }, setLevels] = useState(() => zoomLevels(map));
  // The limits move without the zoom as a bounded map's container resizes, and a sibling may move them before this listens.
  useEffect(() => {
    const update = () => setLevels(zoomLevels(map));
    update();
    map.on("zoomend zoomlevelschange", update);
    return () => {
      map.off("zoomend zoomlevelschange", update);
    };
  }, [map]);
  return (
    <MapControlContainer className={cn("top-2 left-2", className)}>
      <div role="group" aria-label="Zoom" className="flex flex-col gap-1 pointer-coarse:gap-4">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={OVER_TILES}
          aria-label="Zoom in"
          title="Zoom in"
          disabled={zoom >= max}
          onClick={() => map.zoomIn()}
        >
          <PlusIcon />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={OVER_TILES}
          aria-label="Zoom out"
          title="Zoom out"
          disabled={zoom <= min}
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

export { Map, MapBounds, MapControlContainer, MapMarker, MapMarkerClusterGroup, MapTileLayer, MapTooltip, MapZoomControl, elementIcon, markerData, tileSource, useReducedMotion };
