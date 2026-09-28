// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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
    MapTileLayer: () => null,
    MapZoomControl: () => null,
    MapCircle: ({ radius }: { radius: number }) => createElement("div", { "data-testid": "circle", "data-radius": radius }),
    MapMarkerClusterGroup: ({ children }: { children?: unknown }) => createElement(Fragment, null, children as never),
    MapMarker: ({ eventHandlers, children }: { eventHandlers?: { click?: () => void }; children?: unknown }) =>
      createElement("button", { type: "button", onClick: () => eventHandlers?.click?.() }, children as never),
    MapTooltip: ({ children }: { children?: unknown }) => createElement(Fragment, null, children as never),
    markerData: () => undefined,
    elementIcon: () => ({}),
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
const therapist = (slug: string): TherapistCard => ({ slug, name: `Therapist ${slug}`, initials: "T", tags: [] });
const pin = (...slugs: string[]): Pin => ({ key: slugs.join(" "), point: BRIGHTON, therapists: slugs.map((slug) => therapist(slug)) });

function Path() {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

let entries = 0;
function renderPane(props: Partial<MapPaneProps> = {}) {
  return render(
    <MemoryRouter>
      <MapPane
        fitKey=""
        entry={`entry-${++entries}`}
        centreSettled
        radiusMiles={10}
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
  it("draws the distance circle around the centre", () => {
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON, radiusMiles: 5 });
    expect(screen.getByTestId("circle").dataset.radius).toBe(String(5 * 1609.344));
    expect(screen.getByRole("region", { name: "Map of results" })).toBeTruthy();
  });

  it("draws no circle without a centre", () => {
    renderPane();
    expect(screen.queryByTestId("circle")).toBeNull();
  });

  it("remembers its view for the history entry, and opens there again for the same search", () => {
    const { unmount } = renderPane({ fitKey: "Location=Leeds", entry: "remembered" });
    expect(screen.getByTestId("map").dataset.view).toBe("54.5,-3@5");
    moveend.current();
    unmount();
    renderPane({ fitKey: "Location=Leeds", entry: "remembered" });
    expect(screen.getByTestId("map").dataset.view).toBe("51.5,-0.12@11");
    expect(screen.getByTestId("fit").dataset.restored).toBe("Location=Leeds");
  });

  it("frames a different search afresh", () => {
    saveView("afresh", { map: { fitKey: "Location=Leeds", centre: [53.8, -1.55], zoom: 12 } });
    renderPane({ fitKey: "Location=York", entry: "afresh" });
    expect(screen.getByTestId("map").dataset.view).toBe("54.5,-3@5");
    expect(screen.getByTestId("fit").dataset.restored).toBe("");
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
});
