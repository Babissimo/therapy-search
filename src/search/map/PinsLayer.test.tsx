// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import L from "leaflet";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TherapistCard } from "@shared/types";
import { Map } from "@/components/ui/map";
import { createHighlight } from "./highlight";
import { PinsLayer } from "./PinsLayer";
import type { Pin } from "./pins";

const highlight = createHighlight();
const BRIGHTON = { lat: 50.82, lng: -0.14 };
const HOVE = { lat: 50.83, lng: -0.17 };
const therapist = (slug: string): TherapistCard => ({ slug, name: `Therapist ${slug}`, initials: "T", tags: [] });
// Keyed by point, as layoutPins keys a real Pin, so distinct points never collide and a shared point always does.
const pin = (point: typeof BRIGHTON, ...slugs: string[]): Pin => ({
  key: `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`,
  point,
  therapists: slugs.map((slug) => therapist(slug)),
});

const onMap = (children: ReactNode) => (
  <MemoryRouter>
    <Map center={[54.5, -3]} zoom={5} style={{ height: 400, width: 400 }}>
      {children}
    </Map>
  </MemoryRouter>
);

/** Watches the markers handed to the cluster group, whether straightaway or after react-leaflet-cluster's buffered flush. */
function watchAdded() {
  const addLayer = vi.spyOn(L.MarkerClusterGroup.prototype, "addLayer");
  const addLayers = vi.spyOn(L.MarkerClusterGroup.prototype, "addLayers");
  return {
    markers: () => {
      const handed = [...addLayer.mock.calls.map(([layer]) => layer), ...addLayers.mock.calls.flatMap(([layers]) => layers)];
      // Each once, as a marker can reach the group more than once.
      return [...new Set(handed)] as L.Marker[];
    },
    forget: () => {
      addLayer.mockClear();
      addLayers.mockClear();
    },
  };
}

/** The accessible name pinIcon gave a marker's icon. */
const iconName = (marker: L.Marker) => ((marker.options.icon as L.DivIcon).options.html as HTMLElement).getAttribute("aria-label");

afterEach(() => vi.restoreAllMocks());

describe("PinsLayer", () => {
  it("keeps its markers in place when the page re-renders", () => {
    const moved = vi.spyOn(L.Marker.prototype, "setLatLng");
    const { rerender } = render(onMap(<PinsLayer pins={[pin(BRIGHTON, "a"), pin(HOVE, "b", "c")]} highlight={highlight} onSelect={() => {}} />));
    rerender(onMap(<PinsLayer pins={[pin(BRIGHTON, "a"), pin(HOVE, "b", "c")]} highlight={highlight} onSelect={() => {}} />));
    expect(moved).not.toHaveBeenCalled();
  });

  it("names a pin afresh when more therapists join it", async () => {
    const added = watchAdded();
    const { rerender } = render(onMap(<PinsLayer pins={[pin(BRIGHTON, "a")]} highlight={highlight} onSelect={() => {}} />));
    added.forget();
    rerender(onMap(<PinsLayer pins={[pin(BRIGHTON, "a", "b")]} highlight={highlight} onSelect={() => {}} />));
    await waitFor(() => expect(added.markers().map(iconName)).toContain("2 therapists here"));
  });

  it("leaves a pin's name to its icon, so hovering shows the tooltip alone", async () => {
    const added = watchAdded();
    render(onMap(<PinsLayer pins={[pin(BRIGHTON, "a"), pin(HOVE, "b", "c")]} highlight={highlight} onSelect={() => {}} />));
    await waitFor(() => expect(added.markers()).toHaveLength(2));
    expect(added.markers().map(iconName).sort()).toEqual(["2 therapists here", "Therapist a"]);
    // Leaflet's own default: no title, so no native tooltip beside the map's.
    expect(added.markers().map((marker) => marker.options.title)).toEqual(["", ""]);
  });
});
