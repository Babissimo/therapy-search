// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { saveView } from "../viewMemory";
import MapPane from "./MapPane";

// Leaflet draws nothing under jsdom, so the map's pieces become plain elements that show what the pane passed them.
vi.mock("@/components/ui/map", async () => {
  const { createElement } = await import("react");
  return {
    Map: ({ center, zoom, children }: { center: [number, number]; zoom: number; children?: unknown }) =>
      createElement("div", { "data-testid": "map", "data-view": `${center.join(",")}@${zoom}` }, children as never),
    MapTileLayer: () => null,
    MapZoomControl: () => null,
    MapCircle: ({ radius }: { radius: number }) => createElement("div", { "data-testid": "circle", "data-radius": radius }),
  };
});
vi.mock("./FitView", async () => {
  const { createElement } = await import("react");
  return { FitView: ({ restoredFor }: { restoredFor?: string }) => createElement("div", { "data-testid": "fit", "data-restored": restoredFor ?? "" }) };
});
const moveend = vi.hoisted(() => ({ current: () => {} }));
vi.mock("react-leaflet", () => ({
  useMapEvents: (handlers: { moveend: () => void }) => {
    moveend.current = handlers.moveend;
    return { getCenter: () => ({ lat: 51.5, lng: -0.12 }), getZoom: () => 11 };
  },
}));

const BRIGHTON = { lat: 50.82, lng: -0.14 };

describe("MapPane", () => {
  it("draws the distance circle around the centre", () => {
    render(<MapPane fitKey="Location=Brighton" entry="e1" centre={BRIGHTON} centreSettled radiusMiles={5} />);
    expect(screen.getByTestId("circle").dataset.radius).toBe(String(5 * 1609.344));
    expect(screen.getByRole("region", { name: "Map of results" })).toBeTruthy();
  });

  it("draws no circle without a centre", () => {
    render(<MapPane fitKey="" entry="e2" centreSettled radiusMiles={10} />);
    expect(screen.queryByTestId("circle")).toBeNull();
  });

  it("remembers its view for the history entry, and opens there again for the same search", () => {
    const { unmount } = render(<MapPane fitKey="Location=Leeds" entry="e3" centreSettled radiusMiles={10} />);
    expect(screen.getByTestId("map").dataset.view).toBe("54.5,-3@5");
    moveend.current();
    unmount();
    render(<MapPane fitKey="Location=Leeds" entry="e3" centreSettled radiusMiles={10} />);
    expect(screen.getByTestId("map").dataset.view).toBe("51.5,-0.12@11");
    expect(screen.getByTestId("fit").dataset.restored).toBe("Location=Leeds");
  });

  it("frames a different search afresh", () => {
    saveView("e4", { map: { fitKey: "Location=Leeds", centre: [53.8, -1.55], zoom: 12 } });
    render(<MapPane fitKey="Location=York" entry="e4" centreSettled radiusMiles={10} />);
    expect(screen.getByTestId("map").dataset.view).toBe("54.5,-3@5");
    expect(screen.getByTestId("fit").dataset.restored).toBe("");
  });
});
