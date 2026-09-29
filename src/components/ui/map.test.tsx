// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type L from "leaflet";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Map, MapMarker, MapMarkerClusterGroup, MapZoomControl, elementIcon, markerData, tileSource } from "./map";

afterEach(() => vi.unstubAllGlobals());

describe("tileSource", () => {
  it("uses CARTO's light tiles when there is a key, and its dark tiles in the dark theme", () => {
    const { url, attribution } = tileSource("k&y");
    expect(url).toBe("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=k%26y");
    expect(attribution).toContain("OpenStreetMap");
    expect(attribution).toContain("CARTO");
    expect(tileSource("k", true).url).toBe("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=k");
  });

  it("falls back to OpenStreetMap's tiles without one, in either theme", () => {
    expect(tileSource(undefined).url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(tileSource("", true).url).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(tileSource("").attribution).not.toContain("CARTO");
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

  it("credits the map's data alone, with no tiles drawn yet", () => {
    const { container } = render(<Map center={[51.5, -0.1]} zoom={10} style={{ height: 400, width: 400 }} />);
    expect(container.querySelector(".leaflet-control-attribution")?.textContent).not.toContain("Leaflet");
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
    const map = createRef<L.Map>();
    render(<Map ref={map} center={[51.5, -0.1]} zoom={10} style={{ height: 400, width: 400 }} />);
    const invalidate = vi.spyOn(map.current!, "invalidateSize");
    resized();
    expect(invalidate).toHaveBeenCalled();
  });
});
