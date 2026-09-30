// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TherapistCard } from "@shared/types";
import { saveView } from "../viewMemory";
import { UK_BOUNDS } from "./geo";
import { createHighlight } from "./highlight";
import MapPane, { type MapPaneProps } from "./MapPane";
import type { Pin } from "./pins";

// Leaflet draws nothing under jsdom, so the map's pieces become plain elements that show what the pane passed them.
vi.mock("@/components/ui/map", async () => {
  const { createElement, Fragment } = await import("react");
  return {
    Map: ({ center, zoom, children }: { center: [number, number]; zoom: number; children?: unknown }) =>
      createElement("div", { "data-testid": "map", "data-view": `${center.join(",")}@${zoom}` }, children as never),
    MapTileLayer: ({ bounds }: { bounds?: unknown }) => createElement("div", { "data-testid": "tiles", "data-bounds": JSON.stringify(bounds ?? null) }),
    MapBounds: ({ bounds }: { bounds?: unknown }) => createElement("div", { "data-testid": "bounds", "data-bounds": JSON.stringify(bounds ?? null) }),
    MapZoomControl: () => null,
    MapMarkerClusterGroup: ({ children }: { children?: unknown }) => createElement(Fragment, null, children as never),
    MapMarker: ({
      position,
      interactive,
      eventHandlers,
      children,
    }: {
      position: [number, number];
      interactive?: boolean;
      eventHandlers?: { click?: (event: { originalEvent: MouseEvent }) => void };
      children?: unknown;
    }) =>
      interactive === false
        ? createElement("div", { "data-testid": "static-marker", "data-position": position.join(",") })
        : createElement(
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
    FitView: ({
      restored,
      instant,
      coveredBelow,
      recentres,
      onFramed,
    }: {
      restored?: { fitKey: string; pins: number };
      instant?: boolean;
      coveredBelow?: (height: number) => number;
      recentres?: number;
      onFramed?: () => void;
    }) =>
      createElement("button", {
        type: "button",
        "data-testid": "fit",
        "data-instant": String(Boolean(instant)),
        "data-covered": coveredBelow?.(800) ?? "",
        "data-recentres": recentres ?? 0,
        "data-restored": restored ? `${restored.fitKey} with ${restored.pins} pins` : "",
        onClick: onFramed,
      }),
  };
});
vi.mock("./MovedMapButtons", async () => {
  const { createElement, Fragment, useState } = await import("react");
  let mounts = 0;
  type Props = {
    centre?: { lat: number; lng: number };
    settled: boolean;
    coveredBelow?: (height: number) => number;
    onSearch: (postcode: string) => boolean;
    onRecentre?: () => void;
  };
  return {
    // Numbered as it mounts, and clicked to stand for a postcode found near the middle of the map, or a recentre.
    MovedMapButtons: ({ centre, settled, coveredBelow, onSearch, onRecentre }: Props) => {
      const [mount] = useState(() => ++mounts);
      return createElement(
        Fragment,
        null,
        createElement("button", {
          type: "button",
          "data-testid": "search-area",
          "data-mount": mount,
          "data-centre": centre ? `${centre.lat},${centre.lng}` : "",
          "data-settled": String(settled),
          "data-covered": coveredBelow?.(800) ?? "",
          onClick: () => onSearch("BN3 1FG"),
        }),
        onRecentre && createElement("button", { type: "button", "data-testid": "recentre", onClick: onRecentre }),
      );
    },
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
        label="Map of results"
        fitKey="Location=Leeds"
        entry={`entry-${++entries}`}
        centreSettled
        pins={[]}
        placing={false}
        highlight={createHighlight()}
        onSelect={() => {}}
        onSearchArea={() => true}
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
  it("marks the centre with a pin that takes no clicks", () => {
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON, pins: [pin("a")] });
    expect(screen.getByRole("region", { name: "Map of results" })).toBeTruthy();
    expect(screen.getByTestId("static-marker").dataset.position).toBe("50.82,-0.14");
    cleanup();
    renderPane({ pins: [pin("a")] });
    expect(screen.queryByTestId("static-marker")).toBeNull();
  });

  it("offers a search from the middle of the map once the view is settled, handing on the postcode found", () => {
    const onSearchArea = vi.fn(() => true);
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON, onSearchArea });
    const offer = screen.getByTestId("search-area");
    expect([offer.dataset.centre, offer.dataset.settled]).toEqual(["50.82,-0.14", "true"]);
    fireEvent.click(offer);
    expect(onSearchArea).toHaveBeenCalledWith("BN3 1FG");
    cleanup();
    renderPane({ fitKey: "Languages=French" });
    expect(screen.getByTestId("search-area").dataset.centre).toBe("");
    cleanup();
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON, placing: true });
    expect(screen.getByTestId("search-area").dataset.settled).toBe("false");
    cleanup();
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON, centreSettled: false });
    expect(screen.getByTestId("search-area").dataset.settled).toBe("false");
  });

  it("starts the offer afresh from each framing, which it measures the visitor's moves from", () => {
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON });
    const before = screen.getByTestId("search-area").dataset.mount;
    fireEvent.click(screen.getByTestId("fit"));
    expect(screen.getByTestId("search-area").dataset.mount).not.toBe(before);
  });

  it("frames the search again each time the visitor asks, if there is anything to frame", () => {
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON });
    expect(screen.getByTestId("fit").dataset.recentres).toBe("0");
    fireEvent.click(screen.getByTestId("recentre"));
    fireEvent.click(screen.getByTestId("recentre"));
    expect(screen.getByTestId("fit").dataset.recentres).toBe("2");
    cleanup();
    renderPane({ fitKey: "Languages=French", pins: [pin("a")] });
    expect(screen.getByTestId("recentre")).toBeTruthy();
    cleanup();
    renderPane({ fitKey: "Languages=French" });
    expect(screen.queryByTestId("recentre")).toBeNull();
  });

  it("frames and searches clear of whatever covers the map's bottom", () => {
    renderPane({ fitKey: "Location=Brighton", centre: BRIGHTON, coveredBelow: (height) => height / 2 });
    expect(screen.getByTestId("fit").dataset.covered).toBe("400");
    expect(screen.getByTestId("search-area").dataset.covered).toBe("400");
  });

  it("remembers its view and pins for the history entry, and opens there again for the same search", () => {
    const { unmount } = renderPane({ fitKey: "Location=Leeds", entry: "remembered", pins: [pin("a"), pin("b", "c")] });
    expect(screen.getByTestId("map").dataset.view).toBe("54.5,-3@5");
    moveend.current();
    unmount();
    renderPane({ fitKey: "Location=Leeds", entry: "remembered" });
    expect(screen.getByTestId("map").dataset.view).toBe("51.5,-0.12@11");
    expect(screen.getByTestId("fit").dataset.restored).toBe("Location=Leeds with 2 pins");
  });

  it("frames a different search afresh", () => {
    saveView("afresh", { map: { fitKey: "Location=Leeds", pins: 2, centre: [53.8, -1.55], zoom: 12 } });
    renderPane({ fitKey: "Location=York", entry: "afresh" });
    expect(screen.getByTestId("map").dataset.view).toBe("54.5,-3@5");
    expect(screen.getByTestId("fit").dataset.restored).toBe("");
  });

  it("keeps the map to the UK from the start, and its tiles once they show, unless the search reads its location anywhere in the world", () => {
    const bounds = (testId: string) => JSON.parse(screen.getByTestId(testId).dataset.bounds!);
    renderPane();
    expect(bounds("bounds")).toEqual(UK_BOUNDS);
    fireEvent.click(screen.getByTestId("fit"));
    expect(bounds("tiles")).toEqual(UK_BOUNDS);
    cleanup();
    renderPane({ fitKey: "Location=Paris&LocationSearchOutsideUK=true", outsideUK: true });
    expect(bounds("bounds")).toBeNull();
    fireEvent.click(screen.getByTestId("fit"));
    expect(bounds("tiles")).toBeNull();
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
