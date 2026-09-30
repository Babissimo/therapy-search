// @vitest-environment jsdom
import { act, render, waitFor } from "@testing-library/react";
import L from "leaflet";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TherapistCard } from "@shared/types";
import { Map } from "@/components/ui/map";
import { createShortlistStore, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
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
  kind: "outcode",
});

const nobody = createShortlistStore(null);

const onMap = (children: ReactNode, shortlist: ShortlistStore = nobody) => (
  <MemoryRouter>
    <ShortlistContext.Provider value={shortlist}>
      <Map center={[54.5, -3]} zoom={5} style={{ height: 400, width: 400 }}>
        {children}
      </Map>
    </ShortlistContext.Provider>
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

  it("rings the pin or cluster showing the selected pin, and a highlighted therapist's, until they change", async () => {
    // jsdom lays nothing out, so Leaflet draws no icons: the cluster group is asked which marker shows each pin, and answers.
    const shown = { element: document.createElement("div"), setZIndexOffset: vi.fn() };
    vi.spyOn(L.MarkerClusterGroup.prototype, "getVisibleParent").mockReturnValue({
      options: {},
      getElement: () => shown.element,
      setZIndexOffset: shown.setZIndexOffset,
    } as unknown as L.Marker);
    const store = createHighlight();
    const pins = [pin(BRIGHTON, "a"), pin(HOVE, "b", "c")];
    const { rerender } = render(onMap(<PinsLayer pins={pins} highlight={store} selected={pins[1]} onSelect={() => {}} />));
    await waitFor(() => expect(shown.element.classList.contains("pin-selected")).toBe(true));
    act(() => store.set("a"));
    await waitFor(() => expect(shown.element.classList.contains("pin-highlight")).toBe(true));
    expect(shown.setZIndexOffset).toHaveBeenLastCalledWith(1000);
    act(() => store.set(undefined));
    expect(shown.element.classList.contains("pin-highlight")).toBe(false);
    expect(shown.setZIndexOffset).toHaveBeenLastCalledWith(1000);
    rerender(onMap(<PinsLayer pins={pins} highlight={store} onSelect={() => {}} />));
    expect(shown.element.classList.contains("pin-selected")).toBe(false);
    expect(shown.setZIndexOffset).toHaveBeenLastCalledWith(0);
  });

  it("leaves a pin's name to its icon, so hovering shows the tooltip alone", async () => {
    const added = watchAdded();
    render(onMap(<PinsLayer pins={[pin(BRIGHTON, "a"), pin(HOVE, "b", "c")]} highlight={highlight} onSelect={() => {}} />));
    await waitFor(() => expect(added.markers()).toHaveLength(2));
    expect(added.markers().map(iconName).sort()).toEqual(["2 therapists here", "Therapist a"]);
    // Leaflet's own default: no title, so no native tooltip beside the map's.
    expect(added.markers().map((marker) => marker.options.title)).toEqual(["", ""]);
  });

  it("badges and raises shortlisted therapists' pins where it marks the shortlist, and nowhere else", async () => {
    const shortlist = createShortlistStore(null);
    shortlist.add(therapist("a"));
    const pins = [pin(BRIGHTON, "a"), pin(HOVE, "b")];
    const added = watchAdded();
    const { unmount } = render(onMap(<PinsLayer pins={pins} highlight={highlight} marksShortlist onSelect={() => {}} />, shortlist));
    await waitFor(() => expect(added.markers()).toHaveLength(2));
    const [a, b] = ["Therapist a, on your shortlist", "Therapist b"].map((name) => added.markers().find((m) => iconName(m) === name));
    expect(a?.options.zIndexOffset).toBeGreaterThan(0);
    expect(b?.options.zIndexOffset).toBe(0);
    unmount();
    added.forget();
    render(onMap(<PinsLayer pins={pins} highlight={highlight} onSelect={() => {}} />, shortlist));
    await waitFor(() => expect(added.markers()).toHaveLength(2));
    expect(added.markers().map(iconName).sort()).toEqual(["Therapist a", "Therapist b"]);
  });

  it("redraws a pin, and the cluster holding it, in place as its therapist joins or leaves the shortlist", async () => {
    const shortlist = createShortlistStore(null);
    const added = watchAdded();
    render(onMap(<PinsLayer pins={[pin(BRIGHTON, "a"), pin(HOVE, "b")]} highlight={highlight} marksShortlist onSelect={() => {}} />, shortlist));
    await waitFor(() => expect(added.markers()).toHaveLength(2));
    const [a, b] = ["Therapist a", "Therapist b"].map((name) => added.markers().find((m) => iconName(m) === name));
    added.forget();
    const refreshed = vi.spyOn(L.MarkerClusterGroup.prototype, "refreshClusters");
    act(() => shortlist.add(therapist("a")));
    expect(a && iconName(a)).toBe("Therapist a, on your shortlist");
    expect(a?.options.zIndexOffset).toBeGreaterThan(0);
    expect(refreshed).toHaveBeenLastCalledWith([a]);
    // As zooming out gathers them, the cluster drawn picks them out too.
    const group = refreshed.mock.contexts[0] as L.MarkerClusterGroup;
    const gathered = { getAllChildMarkers: () => [b, a] } as unknown as L.MarkerCluster;
    const clusterIcon = (group.options as L.MarkerClusterGroupOptions).iconCreateFunction?.(gathered) as L.DivIcon;
    expect((clusterIcon.options.html as HTMLElement).getAttribute("aria-label")).toBe("2 therapists here, 1 on your shortlist");
    // Reordering the shortlist leaves its members, and so the pins, as they were.
    refreshed.mockClear();
    act(() => shortlist.add(therapist("c")));
    act(() => shortlist.move("c", {}));
    expect(refreshed).not.toHaveBeenCalled();
    act(() => shortlist.remove("a"));
    expect(a && iconName(a)).toBe("Therapist a");
    expect(a?.options.zIndexOffset).toBe(0);
    await new Promise((resolve) => setTimeout(resolve));
    expect(added.markers()).toHaveLength(0);
  });

  it("marks a pin again once the shortlist redraws it", async () => {
    const shown = { element: document.createElement("div"), setZIndexOffset: vi.fn() };
    vi.spyOn(L.MarkerClusterGroup.prototype, "getVisibleParent").mockReturnValue({
      options: {},
      getElement: () => shown.element,
      setZIndexOffset: shown.setZIndexOffset,
    } as unknown as L.Marker);
    const shortlist = createShortlistStore(null);
    const store = createHighlight();
    store.set("a");
    render(onMap(<PinsLayer pins={[pin(BRIGHTON, "a")]} highlight={store} marksShortlist onSelect={() => {}} />, shortlist));
    await waitFor(() => expect(shown.element.classList.contains("pin-highlight")).toBe(true));
    // As Leaflet's setIcon leaves the element it reuses.
    shown.element.className = "";
    act(() => shortlist.add(therapist("a")));
    await waitFor(() => expect(shown.element.classList.contains("pin-highlight")).toBe(true));
  });
});
