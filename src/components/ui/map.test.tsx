// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import L from "leaflet";
import { createRef } from "react";
import { TileLayer, useMapEvents } from "react-leaflet";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Map, MapBounds, MapMarker, MapMarkerClusterGroup, MapTileLayer, MapZoomControl, elementIcon, markerData, tileSource } from "./map";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** jsdom lays nothing out, so every element reports the size given, which a test can change. */
function sizeElements(size: { width: number; height: number }) {
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(() => size.width);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(() => size.height);
}

describe("tileSource", () => {
  it("uses CARTO's light tiles when there is a key, and its dark tiles in the dark theme", () => {
    const { url, attribution } = tileSource("k&y");
    expect(url).toBe("https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=k%26y");
    expect(attribution).toContain("OpenStreetMap");
    expect(attribution).toContain("CARTO");
    expect(tileSource("k", true).url).toBe("https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=k");
  });

  it("links CARTO's credit to the page CARTO's terms name for it", () => {
    expect(tileSource("k").attribution).toContain('<a href="https://carto.com/attribution/">CARTO</a>');
  });

  it("says which tiles are dark, for their tint to follow", () => {
    expect(tileSource("k").dark).toBe(false);
    expect(tileSource("k", true).dark).toBe(true);
  });

  it("falls back to OpenStreetMap's tiles without one, in either theme", () => {
    expect(tileSource(undefined).url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(tileSource("", true).url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(tileSource("", true).dark).toBe(false);
    expect(tileSource("").attribution).not.toContain("CARTO");
  });
});

describe("MapTileLayer", () => {
  /** The columns of tiles fetched, read from each tile's address, which ends `{x}/{y}.png`. */
  const columns = (container: HTMLElement) =>
    [...new Set([...container.querySelectorAll<HTMLImageElement>(".leaflet-tile")].map((tile) => Number(tile.src.split("/").at(-2))))].sort(
      (a, b) => a - b,
    );

  it("fetches no tiles beyond its bounds, and all around once they are lifted", () => {
    // At zoom 4 each column spans 22.5 degrees, so a view 1,000 pixels wide takes in columns 6 to 9.
    sizeElements({ width: 1000, height: 600 });
    const { container, rerender } = render(
      <Map center={[0, 0]} zoom={4}>
        <MapTileLayer
          bounds={[
            [-10, -10],
            [10, 10],
          ]}
        />
      </Map>,
    );
    expect(columns(container)).toEqual([7, 8]);
    rerender(
      <Map center={[0, 0]} zoom={4}>
        <MapTileLayer />
      </Map>,
    );
    expect(columns(container)).toEqual([6, 7, 8, 9]);
  });
});

describe("elementIcon", () => {
  it("centres a ready-made element on the marker's point", () => {
    const html = document.createElement("span");
    expect(elementIcon(html, [40, 32]).options).toMatchObject({ html, className: "", iconSize: [40, 32], iconAnchor: [20, 16] });
  });
});

describe("Map", () => {
  it("zooms with its own controls", () => {
    const map = createRef<L.Map>();
    render(
      <Map ref={map} center={[51.5, -0.1]} zoom={10} style={{ height: 400, width: 400 }}>
        <MapZoomControl />
      </Map>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(map.current?.getZoom()).toBe(11);
  });

  it("keeps clicks on its controls, and on a marker that takes them, off the map beneath", () => {
    const clicked = vi.fn();
    function Clicks() {
      useMapEvents({ click: clicked });
      return null;
    }
    const pin = document.createElement("span");
    const pinClicked = vi.fn();
    const { container } = render(
      <Map center={[51.5, -0.1]} zoom={10} style={{ height: 400, width: 400 }}>
        <MapZoomControl />
        <MapMarker position={[51.5, -0.1]} icon={elementIcon(pin, [40, 40])} eventHandlers={{ click: pinClicked }} />
        <Clicks />
      </Map>,
    );
    fireEvent.click(pin);
    expect(pinClicked).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(clicked).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector(".leaflet-container")!);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it("credits the map's data alone, with no tiles drawn yet", () => {
    const { container } = render(<Map center={[51.5, -0.1]} zoom={10} style={{ height: 400, width: 400 }} />);
    expect(container.querySelector(".leaflet-control-attribution")?.textContent).not.toContain("Leaflet");
  });

  describe("with credits shared among several maps", () => {
    const CREDITS = '&copy; <a href="https://osm.test/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.test/attribution">CARTO</a>';
    /** Each map's credits, by their text, and their links' tabindex, in the page's order. */
    const credits = (container: HTMLElement) =>
      [...container.querySelectorAll(".leaflet-control-attribution")].map((box) => [
        box.textContent,
        [...box.querySelectorAll("a")].map((link) => link.getAttribute("tabindex")),
      ]);
    const map = (key: string, shared = true, tiles = "a") => (
      <Map key={key} center={[51.5, -0.1]} zoom={10} sharedCredits={shared} style={{ height: 200, width: 200 }}>
        <TileLayer key={tiles} url={`https://tiles.test/${tiles}/{z}/{x}/{y}.png`} attribution={CREDITS} />
      </Map>
    );
    const shown = "© OpenStreetMap, © CARTO";

    it("shows every map's credits, keeping only the first map's links in the Tab order", async () => {
      const { container } = render(
        <>
          {map("one")}
          {map("two")}
          {map("lone", false)}
          {map("three")}
        </>,
      );
      await waitFor(() =>
        expect(credits(container)).toEqual([
          [shown, [null, null]],
          [shown, ["-1", "-1"]],
          [shown, [null, null]],
          [shown, ["-1", "-1"]],
        ]),
      );
    });

    it("hands the Tab stop on to the next map when the first goes", async () => {
      const { container, rerender } = render(
        <>
          {map("one")}
          {map("two")}
        </>,
      );
      await waitFor(() => expect(credits(container).map(([, tabs]) => tabs)).toEqual([[null, null], ["-1", "-1"]]));
      rerender(<>{map("two")}</>);
      expect(credits(container)).toEqual([[shown, [null, null]]]);
    });

    it("keeps its place in the Tab order as Leaflet writes the credits afresh, as a theme's tiles do", async () => {
      const { container, rerender } = render(
        <>
          {map("one")}
          {map("two")}
        </>,
      );
      await waitFor(() => expect(credits(container).map(([, tabs]) => tabs)).toEqual([[null, null], ["-1", "-1"]]));
      rerender(
        <>
          {map("one", true, "dark")}
          {map("two", true, "dark")}
        </>,
      );
      await waitFor(() =>
        expect(credits(container)).toEqual([
          [shown, [null, null]],
          [shown, ["-1", "-1"]],
        ]),
      );
      expect(container.querySelectorAll(".leaflet-tile-pane img[src*='/dark/']").length).toBeGreaterThan(0);
    });
  });

  it("lets a cluster read the data its markers carry", async () => {
    const cluster = createRef<L.MarkerClusterGroup>();
    render(
      <Map center={[51.5, -0.1]} zoom={10} style={{ height: 400, width: 400 }}>
        <MapMarkerClusterGroup ref={cluster}>
          <MapMarker position={[51.5, -0.1]} icon={elementIcon(document.createElement("span"), [40, 40])} data={{ slug: "jo" }} />
        </MapMarkerClusterGroup>
      </Map>,
    );
    await waitFor(() => expect(cluster.current?.getLayers()).toHaveLength(1));
    expect(markerData(cluster.current!.getLayers()[0] as L.Marker)).toEqual({ slug: "jo" });
  });

  it("remeasures itself when its container changes size", () => {
    let resized = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const size = { width: 400, height: 400 };
    sizeElements(size);
    const map = createRef<L.Map>();
    render(<Map ref={map} center={[51.5, -0.1]} zoom={10} style={{ height: 400, width: 400 }} />);
    const invalidate = vi.spyOn(map.current!, "invalidateSize");
    resized();
    expect(invalidate).toHaveBeenCalledOnce();
    // Hidden, as on paper, it keeps the size it had, which a search's pins arriving meanwhile are framed in.
    size.width = 0;
    size.height = 0;
    resized();
    expect(invalidate).toHaveBeenCalledOnce();
    expect(map.current!.getSize()).toEqual(L.point(400, 400));
  });

  describe("for a visitor who asks for less motion", () => {
    /** Asks for less motion or not, as `reduce` says, until the returned function changes the setting mid-visit. */
    function askForLessMotion(reduce: boolean) {
      const listeners = new Set<() => void>();
      vi.stubGlobal("matchMedia", (query: string) => ({
        get matches() {
          return query === "(prefers-reduced-motion: reduce)" && reduce;
        },
        media: query,
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }));
      return (next: boolean) => {
        reduce = next;
        act(() => listeners.forEach((listener) => listener()));
      };
    }

    /** A map with a cluster group, and whether each kind of motion is still: a zoom's, a drag's and pinch's ends, and the clusters'. */
    function renderMap() {
      sizeElements({ width: 400, height: 400 });
      // Leaflet zooms by setView, which says whether to glide.
      const setView = vi.spyOn(L.Map.prototype, "setView");
      const map = createRef<L.Map>();
      const cluster = createRef<L.MarkerClusterGroup>();
      render(
        <Map ref={map} center={[51.5, -0.1]} zoom={10} style={{ height: 400, width: 400 }}>
          <MapMarkerClusterGroup ref={cluster}>{null}</MapMarkerClusterGroup>
        </Map>,
      );
      const ways = L.MarkerClusterGroup.prototype as unknown as Record<"_noAnimation", { _animationZoomIn: unknown }>;
      const still = () => {
        map.current!.zoomIn();
        const { inertia, zoomAnimation } = map.current!.options;
        return {
          zoom: setView.mock.lastCall?.[2]?.animate === false,
          ends: !inertia && !zoomAnimation,
          clusters: (cluster.current as unknown as { _animationZoomIn: unknown })._animationZoomIn === ways._noAnimation._animationZoomIn,
        };
      };
      return { map, still };
    }

    it("zooms, pans and splits clusters at once, and stops a drag or a pinch where it is let go, from the moment they ask", () => {
      const change = askForLessMotion(false);
      const { map, still } = renderMap();
      expect(still()).toEqual({ zoom: false, ends: false, clusters: false });
      change(true);
      expect(still()).toEqual({ zoom: true, ends: true, clusters: true });
      // An arrow key's pan, which would otherwise end a quarter of a second later.
      const moved = vi.fn();
      map.current!.on("moveend", moved);
      map.current!.panBy([50, 0]);
      expect(moved).toHaveBeenCalledOnce();
    });

    it("moves again once they no longer ask", () => {
      const change = askForLessMotion(true);
      const { still } = renderMap();
      expect(still()).toEqual({ zoom: true, ends: true, clusters: true });
      change(false);
      expect(still()).toEqual({ zoom: false, ends: false, clusters: false });
    });
  });
});

describe("MapBounds", () => {
  // Twenty degrees each way, which span 228 pixels at zoom 4 and 114 at zoom 3.
  const AROUND: L.LatLngBoundsLiteral = [
    [-10, -10],
    [10, 10],
  ];
  // Leaflet holds the view within bounds to the nearest pixel; a fifth of a degree either side allows for it.
  const toThePixel = (bounds: L.LatLngBoundsLiteral) => L.latLngBounds(bounds).pad(0.01);

  it("keeps the view within its bounds", () => {
    sizeElements({ width: 400, height: 200 });
    const map = createRef<L.Map>();
    render(
      <Map ref={map} center={[0, 0]} zoom={6}>
        <MapBounds bounds={AROUND} />
      </Map>,
    );
    map.current!.setView([40, 40], 6, { animate: false });
    expect(toThePixel(AROUND).contains(map.current!.getBounds())).toBe(true);
  });

  it("settles within its bounds at once, so nothing that listens afterwards hears the map move", async () => {
    sizeElements({ width: 400, height: 200 });
    const moved = vi.fn();
    function Listener() {
      useMapEvents({ moveend: moved });
      return null;
    }
    const map = createRef<L.Map>();
    render(
      <Map ref={map} center={[12, 12]} zoom={5}>
        <MapBounds bounds={AROUND} />
        <Listener />
      </Map>,
    );
    expect(toThePixel(AROUND).contains(map.current!.getBounds())).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(moved).not.toHaveBeenCalled();
  });

  it("zooms out no further than shows its bounds whole, zooming in when its container grows", () => {
    const size = { width: 400, height: 400 };
    sizeElements(size);
    const map = createRef<L.Map>();
    render(
      <Map ref={map} center={[0, 0]} zoom={6}>
        <MapBounds bounds={AROUND} />
      </Map>,
    );
    expect(map.current!.getMinZoom()).toBe(4);
    size.height = 200;
    map.current!.invalidateSize();
    expect(map.current!.getMinZoom()).toBe(3);
    map.current!.setZoom(3, { animate: false });
    size.height = 400;
    map.current!.invalidateSize();
    expect(map.current!.getMinZoom()).toBe(4);
    expect(map.current!.getZoom()).toBe(4);
  });

  it("disables zooming out at the furthest, though the furthest was set before the control listened", () => {
    sizeElements({ width: 400, height: 200 });
    render(
      <Map center={[0, 0]} zoom={3}>
        <MapBounds bounds={AROUND} />
        <MapZoomControl />
      </Map>,
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zoom out" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Zoom in" }).disabled).toBe(false);
  });

  it("zooms out no further than the map's own minimum, when that is higher", () => {
    sizeElements({ width: 400, height: 200 });
    const map = createRef<L.Map>();
    render(
      <Map ref={map} center={[0, 0]} zoom={6} minZoom={4}>
        <MapBounds bounds={AROUND} />
      </Map>,
    );
    expect(map.current!.getMinZoom()).toBe(4);
  });

  it("lets the map roam as it did once its bounds are lifted", () => {
    sizeElements({ width: 400, height: 200 });
    const map = createRef<L.Map>();
    const { rerender } = render(
      <Map ref={map} center={[0, 0]} zoom={6} minZoom={1}>
        <MapBounds bounds={AROUND} />
      </Map>,
    );
    rerender(
      <Map ref={map} center={[0, 0]} zoom={6} minZoom={1}>
        <MapBounds />
      </Map>,
    );
    expect(map.current!.getMinZoom()).toBe(1);
    expect(map.current!.options.maxBoundsViscosity).toBe(0);
    map.current!.setView([40, 40], 6, { animate: false });
    expect(map.current!.getCenter().lat).toBeCloseTo(40);
    expect(map.current!.getCenter().lng).toBeCloseTo(40);
  });
});
