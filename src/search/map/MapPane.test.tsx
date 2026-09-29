// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TherapistCard } from "@shared/types";
import { saveView } from "../viewMemory";
import { createHighlight } from "./highlight";
import MapPane, { type MapPaneProps } from "./MapPane";
import type { Pin } from "./pins";

// Leaflet draws nothing under jsdom, so the map's pieces become plain elements that show what the pane passed them.
vi.mock("@/components/ui/map", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    Map: ({ center, zoom, children }: { center: [number, number]; zoom: number; children?: unknown }) =>
      createElement("div", { "data-testid": "map", "data-view": `${center.join(",")}@${zoom}` }, children as never),
    MapTileLayer: () => createElement("div", { "data-testid": "tiles" }),
    MapZoomControl: () => null,
    MapCircle: ({ radius }: { radius: number }) => createElement("div", { "data-testid": "circle", "data-radius": radius }),
    MapMarkerClusterGroup: ({ children }: { children?: unknown }) => createElement(Fragment, null, children as never),
    MapMarker: ({ eventHandlers, children }: { eventHandlers?: { click?: (event: { originalEvent: MouseEvent }) => void }; children?: unknown }) =>
      createElement(
        "button",
        { type: "button", onClick: (event: { nativeEvent: MouseEvent }) => eventHandlers?.click?.({ originalEvent: event.nativeEvent }) },
        children as never,
      ),
    MapTooltip: ({ children }: { children?: unknown }) => createElement(Fragment, null, children as never),
    markerData: () => undefined,
    elementIcon: () => ({}),
  };
});
vi.mock("./FitView", async () => {
  const { createElement } = await import("react");
  return {
    // Clicked to stand for the view being framed.
    FitView: ({ restored, instant, onFramed }: { restored?: { fitKey: string; pins: number; reach?: number }; instant?: boolean; onFramed?: () => void }) =>
      createElement("button", {
        type: "button",
        "data-testid": "fit",
        "data-instant": String(Boolean(instant)),
        "data-restored": restored ? `${restored.fitKey} with ${restored.pins} pins${restored.reach === undefined ? "" : ` to ${restored.reach} miles`}` : "",
        onClick: onFramed,
      }),
  };
});
const moveend = vi.hoisted(() => ({ current: () => {} }));
vi.mock("react-leaflet", () => ({
  useMapEvents: (handlers: { moveend: () => void }) => {
    moveend.current = handlers.moveend;
    return { getCenter: () => ({ lat: 51.5, lng: -0.12 }), getZoom: () => 11 };
  },
  useMap: () => ({ on: () => {}, off: () => {} }),
}));

const BRIGHTON = { lat: 50.82, lng: -0.14 };
const therapist = (slug: string): TherapistCard => ({ slug, name: `Therapist ${slug}`, initials: "T", tags: [] });
const pin = (...slugs: string[]): Pin => ({ key: slugs.join(" "), point: BRIGHTON, therapists: slugs.map((slug) => therapist(slug)), kind: "outcode" });

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

let entries = 0;
function renderPane(props: Partial<MapPaneProps> = {}) {
  return render(
    <MemoryRouter>
      <MapPane
        fitKey="Location=Leeds"
        entry={`entry-${++entries}`}
        centreSettled
        pins={[]}
        placing={false}
        highlight={createHighlight()}
        onSelect={() => {}}
        {...props}
      />
      <Path />
    </MemoryRouter>,
  );
}

function pointerCanHover(hover: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: hover && query === "(hover: hover)",
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("MapPane", () => {
  it("draws a circle around the centre out to the furthest of UKCP's distances, wherever the pins fall", () => {
    const lewes = { ...pin("c"), point: { lat: 50.87, lng: 0.01 } };
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON, reachMiles: 0.4, pins: [pin("a", "b"), lewes] });
    expect(Number(screen.getByTestId("circle").dataset.radius)).toBeCloseTo(0.4 * 1609.344);
    expect(screen.getByRole("region", { name: "Map of results" })).toBeTruthy();
  });

  it("draws no circle without a centre, or before any card is further than 0 miles", () => {
    renderPane({ reachMiles: 2, pins: [pin("a")] });
    expect(screen.queryByTestId("circle")).toBeNull();
    cleanup();
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON, pins: [pin("a")] });
    expect(screen.queryByTestId("circle")).toBeNull();
    cleanup();
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON, reachMiles: 0, pins: [pin("a")] });
    expect(screen.queryByTestId("circle")).toBeNull();
  });

  it("remembers its view, pins and circle for the history entry, and opens there again for the same search", () => {
    const { unmount } = renderPane({ fitKey: "Location=Leeds", entry: "remembered", reachMiles: 2, pins: [pin("a"), pin("b", "c")] });
    expect(screen.getByTestId("map").dataset.view).toBe("54.5,-3@5");
    moveend.current();
    unmount();
    renderPane({ fitKey: "Location=Leeds", entry: "remembered" });
    expect(screen.getByTestId("map").dataset.view).toBe("51.5,-0.12@11");
    expect(screen.getByTestId("fit").dataset.restored).toBe("Location=Leeds with 2 pins to 2 miles");
  });

  it("frames a different search afresh", () => {
    saveView("afresh", { map: { fitKey: "Location=Leeds", pins: 2, centre: [53.8, -1.55], zoom: 12 } });
    renderPane({ fitKey: "Location=York", entry: "afresh" });
    expect(screen.getByTestId("map").dataset.view).toBe("54.5,-3@5");
    expect(screen.getByTestId("fit").dataset.restored).toBe("");
  });

  it("holds a search's tiles back until it is framed, framing it without animation", () => {
    renderPane({ fitKey: "Location=York" });
    expect(screen.queryByTestId("tiles")).toBeNull();
    expect(screen.getByTestId("fit").dataset.instant).toBe("true");
    fireEvent.click(screen.getByTestId("fit"));
    expect(screen.getByTestId("tiles")).toBeTruthy();
    expect(screen.getByTestId("fit").dataset.instant).toBe("false");
  });

  it("shows a view restored at once, with its tiles", () => {
    saveView("restored", { map: { fitKey: "Location=Leeds", pins: 2, centre: [53.8, -1.55], zoom: 12 } });
    renderPane({ fitKey: "Location=Leeds", entry: "restored" });
    expect(screen.getByTestId("tiles")).toBeTruthy();
  });

  it("pins therapists, stacking those who share a point", () => {
    renderPane({ pins: [pin("a"), pin("b", "c")] });
    expect(screen.getByRole("button", { name: "Therapist a" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2 therapists here" })).toBeTruthy();
  });

  it("opens a therapist's profile from their pin where the pointer can hover", () => {
    pointerCanHover(true);
    renderPane({ pins: [pin("a")] });
    fireEvent.click(screen.getByRole("button", { name: "Therapist a" }));
    expect(screen.getByTestId("path").textContent).toBe("/therapist/a");
  });

  it("selects a pin instead on touch screens, and a stacked pin anywhere", () => {
    const onSelect = vi.fn();
    renderPane({ pins: [pin("a"), pin("b", "c")], onSelect });
    pointerCanHover(false);
    fireEvent.click(screen.getByRole("button", { name: "Therapist a" }));
    pointerCanHover(true);
    fireEvent.click(screen.getByRole("button", { name: "2 therapists here" }));
    expect(onSelect.mock.calls.map(([selected]) => selected.key)).toEqual(["a", "b c"]);
    expect(screen.getByTestId("path").textContent).toBe("/");
  });

  it("activates a pin once for a double-click", () => {
    const onSelect = vi.fn();
    renderPane({ pins: [pin("b", "c")], onSelect });
    const stack = screen.getByRole("button", { name: "2 therapists here" });
    fireEvent.click(stack, { detail: 1 });
    fireEvent.click(stack, { detail: 2 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
