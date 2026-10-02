// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import type { View } from "./geo";
import { viewAround } from "./geo.testing";
import { ALREADY_SEARCHED, AREA_UNKNOWN, MovedMapButtons, NO_POSTCODE_HERE } from "./MovedMapButtons";

// A map 400 by 800 pixels, unless resized, that shows whatever view a test gives it, telling whoever is listening as a
// pan or zoom would.
const leaflet = vi.hoisted(() => {
  let view: View = { north: 0, south: 0, east: 0, west: 0 };
  let size = { x: 400, y: 800 };
  const listeners = new Set<() => void>();
  const container = document.createElement("div");
  container.tabIndex = 0;
  document.body.append(container);
  const map = {
    getBounds: () => ({ getNorth: () => view.north, getSouth: () => view.south, getEast: () => view.east, getWest: () => view.west }),
    getContainer: () => container,
    getSize: () => size,
    // Degrees of longitude to a pixel, on a scale where each level in is half the last, as Leaflet's zoom is.
    getZoom: () => -Math.log2((view.east - view.west) / size.x),
    getCenter: () => ({ lat: (view.north + view.south) / 2, lng: (view.east + view.west) / 2 }),
    // Evenly across the view, which is near enough over a few miles.
    containerPointToLatLng: ([x, y]: [number, number]) => ({
      lat: view.north - ((view.north - view.south) * y) / size.y,
      lng: view.west + ((view.east - view.west) * x) / size.x,
    }),
    latLngToContainerPoint: ({ lat, lng }: { lat: number; lng: number }) => ({
      x: ((lng - view.west) * size.x) / (view.east - view.west),
      y: ((view.north - lat) * size.y) / (view.north - view.south),
    }),
    on: (type: string, listener: () => void) => void (type === "moveend" && listeners.add(listener)),
    off: (type: string, listener: () => void) => void (type === "moveend" && listeners.delete(listener)),
  };
  return {
    map,
    container,
    start: (next: View) => {
      view = next;
      size = { x: 400, y: 800 };
    },
    show: (next: View, resized = size) => {
      view = next;
      size = resized;
      listeners.forEach((listener) => listener());
    },
  };
});
vi.mock("react-leaflet", async (importOriginal) => ({ ...(await importOriginal<typeof import("react-leaflet")>()), useMap: () => leaflet.map }));

const BRIGHTON = { lat: 50.8225, lng: -0.1372 };
const HOVE = { lat: 50.835, lng: -0.178 };

/** Mounts the button on a map framed around `framed`, then shows `view`. */
function renderAt(
  view: View,
  {
    framed = viewAround(BRIGHTON, 5),
    settled = true,
    onSearch = vi.fn(() => true),
    onRecentre = undefined as (() => void) | undefined,
  } = {},
) {
  leaflet.start(framed);
  render(<MovedMapButtons centre={BRIGHTON} settled={settled} onSearch={onSearch} onRecentre={onRecentre} />);
  act(() => leaflet.show(view));
  return onSearch;
}

/** Mounts the buttons on a map framed around `framed` with no search to offer, as the shortlist's map is, then shows `view`. */
function renderWithoutSearch(view: View, onRecentre?: () => void, framed = viewAround(BRIGHTON, 5)) {
  leaflet.start(framed);
  render(<MovedMapButtons settled onRecentre={onRecentre} />);
  act(() => leaflet.show(view));
}

/** Moves the map once its effects run, as the framing of a search does. */
function Framer({ view }: { view?: View }) {
  useEffect(() => {
    if (view) leaflet.show(view);
  }, [view]);
  return null;
}

const button = () => screen.queryByRole("button", { name: "Search this area" });
const press = () => fireEvent.click(button()!);
const recentreButton = () => screen.queryByRole("button", { name: "Recentre" });

afterEach(() => vi.restoreAllMocks());

describe("MovedMapButtons", () => {
  it("offers to search the area in view once the map is moved well away from where the search framed it", () => {
    renderAt(viewAround(BRIGHTON, 4));
    expect(button()).toBeNull();
    act(() => leaflet.show(viewAround(HOVE, 5)));
    expect(button()).not.toBeNull();
  });

  it("offers no search zoomed in on the search's own place, however far from it the frame's middle lies", () => {
    // Stretched north by a pin far out, as a search's frame takes in every pin.
    const framed = viewAround({ lat: BRIGHTON.lat + 20 / 69.05, lng: BRIGHTON.lng }, 50);
    renderAt(viewAround(BRIGHTON, 5), { framed, onRecentre: vi.fn() });
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("hears a move made as it renders again", () => {
    leaflet.start(viewAround(BRIGHTON, 5));
    const { rerender } = render(
      <>
        <Framer />
        <MovedMapButtons centre={BRIGHTON} settled={false} onSearch={vi.fn(() => true)} />
      </>,
    );
    rerender(
      <>
        <Framer view={viewAround(HOVE, 5)} />
        <MovedMapButtons centre={BRIGHTON} settled onSearch={vi.fn(() => true)} />
      </>,
    );
    expect(button()).not.toBeNull();
  });

  it("hands focus to the map when its search starts and it goes, rather than dropping it, and keeps it until then", () => {
    leaflet.start(viewAround(BRIGHTON, 5));
    const { rerender } = render(<MovedMapButtons centre={BRIGHTON} settled onSearch={vi.fn(() => true)} />);
    act(() => leaflet.show(viewAround(HOVE, 5)));
    button()!.focus();
    rerender(<MovedMapButtons centre={BRIGHTON} settled onSearch={vi.fn(() => true)} />);
    expect(document.activeElement).toBe(button());
    rerender(<MovedMapButtons centre={BRIGHTON} settled={false} onSearch={vi.fn(() => true)} />);
    expect(document.activeElement).toBe(leaflet.container);
  });

  it("hands focus to the map as it starts to go, before it fades out of reach", () => {
    // The exit animation the page's styles give it, which jsdom reads but never plays.
    const styles = document.head.appendChild(Object.assign(document.createElement("style"), { textContent: "[data-leaving] { animation-name: exit; }" }));
    onTestFinished(() => styles.remove());
    leaflet.start(viewAround(BRIGHTON, 5));
    const { rerender } = render(<MovedMapButtons centre={BRIGHTON} settled onSearch={vi.fn(() => true)} />);
    act(() => leaflet.show(viewAround(HOVE, 5)));
    button()!.focus();
    rerender(<MovedMapButtons centre={BRIGHTON} settled={false} onSearch={vi.fn(() => true)} />);
    expect(document.activeElement).toBe(leaflet.container);
    const leaving = button()!.closest("[inert]")!;
    // jsdom has no AnimationEvent.
    act(() => void leaving.dispatchEvent(Object.assign(new Event("animationend"), { animationName: "exit" })));
    expect(button()).toBeNull();
  });

  it("hands focus to the map as a framing mounts it afresh while it still offers a search", () => {
    leaflet.start(viewAround(BRIGHTON, 5));
    const { unmount } = render(<MovedMapButtons centre={BRIGHTON} settled onSearch={vi.fn(() => true)} />);
    act(() => leaflet.show(viewAround(HOVE, 5)));
    button()!.focus();
    unmount();
    expect(document.activeElement).toBe(leaflet.container);
  });

  it("offers to recentre only beside a search of the area, not after a move too small to search elsewhere", () => {
    const framed = viewAround(BRIGHTON, 5);
    renderAt({ ...framed, north: framed.north + 0.001, south: framed.south + 0.001 }, { onRecentre: vi.fn() });
    expect(screen.queryByRole("group")).toBeNull();
    act(() => leaflet.show(viewAround(BRIGHTON, 3)));
    expect(screen.queryByRole("group")).toBeNull();
    act(() => leaflet.show(viewAround(HOVE, 5)));
    expect([button(), recentreButton()].every(Boolean)).toBe(true);
  });

  it("offers nothing as the map is resized about its middle", () => {
    const framed = viewAround(BRIGHTON, 5);
    const half = (framed.east - framed.west) / 2;
    leaflet.start(framed);
    render(<MovedMapButtons centre={BRIGHTON} settled onSearch={vi.fn(() => true)} onRecentre={vi.fn()} />);
    // Twice as wide at the same scale, as when a panel beside it closes.
    act(() => leaflet.show({ ...framed, east: framed.east + half, west: framed.west - half }, { x: 800, y: 800 }));
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("offers to recentre beside the search, going at once when pressed and handing focus to the map", () => {
    const onRecentre = vi.fn();
    renderAt(viewAround(HOVE, 5), { onRecentre });
    expect(within(screen.getByRole("group")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Search this area", "Recentre"]);
    recentreButton()!.focus();
    fireEvent.click(recentreButton()!);
    expect(onRecentre).toHaveBeenCalledOnce();
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(leaflet.container);
  });

  it("offers only to recentre where there is no search to make, and nothing with no frame to return to either", () => {
    renderWithoutSearch(viewAround(HOVE, 5), vi.fn());
    expect(within(screen.getByRole("group")).getAllByRole("button").map((b) => b.textContent)).toEqual(["Recentre"]);
    cleanup();
    renderWithoutSearch(viewAround(HOVE, 5));
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("ignores a recentre while the search it offers looks for a postcode", async () => {
    vi.spyOn(api, "nearest").mockReturnValue(new Promise(() => {}));
    const onRecentre = vi.fn();
    renderAt(viewAround(HOVE, 5), { onRecentre });
    press();
    await waitFor(() => expect(recentreButton()!.getAttribute("aria-disabled")).toBe("true"));
    fireEvent.click(recentreButton()!);
    expect(onRecentre).not.toHaveBeenCalled();
  });

  it("offers nothing while a search is settling", () => {
    renderAt(viewAround(HOVE, 5), { settled: false });
    expect(button()).toBeNull();
  });

  it("searches the postcode nearest the middle of the map", async () => {
    const nearest = vi.spyOn(api, "nearest").mockResolvedValue({ found: true, postcode: "BN3 1FG" });
    const onSearch = renderAt(viewAround(HOVE, 5));
    press();
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith("BN3 1FG"));
    expect(nearest).toHaveBeenCalledWith(expect.closeTo(HOVE.lat, 6), expect.closeTo(HOVE.lng, 6));
  });

  it("says so when the postcode found is the one already searched", async () => {
    vi.spyOn(api, "nearest").mockResolvedValue({ found: true, postcode: "BN1 1AA" });
    const onSearch = renderAt(viewAround(HOVE, 5), { onSearch: vi.fn(() => false) });
    press();
    expect((await screen.findByRole("alert")).textContent).toBe(ALREADY_SEARCHED);
    expect(onSearch).toHaveBeenCalledWith("BN1 1AA");
  });

  it("says so when no postcode is near, until the map moves again", async () => {
    vi.spyOn(api, "nearest").mockResolvedValue({ found: false });
    const onSearch = renderAt(viewAround(HOVE, 5));
    press();
    expect((await screen.findByRole("alert")).textContent).toBe(NO_POSTCODE_HERE);
    expect(onSearch).not.toHaveBeenCalled();
    act(() => leaflet.show(viewAround(HOVE, 4)));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("passes on the Worker's reason when the lookup fails, or says it couldn't look", async () => {
    const nearest = vi.spyOn(api, "nearest").mockRejectedValue(new ApiError(429, "Too many searches in a short time. Wait a minute and try again."));
    renderAt(viewAround(HOVE, 5));
    press();
    expect((await screen.findByRole("alert")).textContent).toBe("Too many searches in a short time. Wait a minute and try again.");
    nearest.mockRejectedValue(new TypeError("Failed to fetch"));
    press();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(AREA_UNKNOWN));
  });

  it("ignores a second press while it looks", async () => {
    const nearest = vi.spyOn(api, "nearest").mockReturnValue(new Promise(() => {}));
    renderAt(viewAround(HOVE, 5));
    press();
    press();
    await waitFor(() => expect(nearest).toHaveBeenCalled());
    expect(nearest).toHaveBeenCalledOnce();
  });
});
