// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api";
import type { View } from "./geo";
import { viewAround } from "./geo.testing";
import { ALREADY_SEARCHED, AREA_UNKNOWN, NO_POSTCODE_HERE, SearchAreaButton } from "./SearchAreaButton";

// A map 400 by 800 pixels that shows whatever view a test gives it, telling whoever is listening as a pan or zoom would.
const leaflet = vi.hoisted(() => {
  let view: View = { north: 0, south: 0, east: 0, west: 0 };
  const size = { x: 400, y: 800 };
  const listeners = new Set<() => void>();
  const container = document.createElement("div");
  container.tabIndex = 0;
  document.body.append(container);
  const map = {
    getBounds: () => ({ getNorth: () => view.north, getSouth: () => view.south, getEast: () => view.east, getWest: () => view.west }),
    getContainer: () => container,
    getSize: () => size,
    // Evenly across the view, which is near enough over a few miles.
    containerPointToLatLng: ([x, y]: [number, number]) => ({
      lat: view.north - ((view.north - view.south) * y) / size.y,
      lng: view.west + ((view.east - view.west) * x) / size.x,
    }),
    on: (type: string, listener: () => void) => void (type === "moveend" && listeners.add(listener)),
    off: (type: string, listener: () => void) => void (type === "moveend" && listeners.delete(listener)),
  };
  return {
    map,
    container,
    start: (next: View) => (view = next),
    show: (next: View) => {
      view = next;
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
  { framed = viewAround(BRIGHTON, 5), settled = true, onSearch = vi.fn(() => true), coveredBelow = undefined as ((height: number) => number) | undefined } = {},
) {
  leaflet.start(framed);
  render(<SearchAreaButton centred settled={settled} onSearch={onSearch} coveredBelow={coveredBelow} />);
  act(() => leaflet.show(view));
  return onSearch;
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

afterEach(() => vi.restoreAllMocks());

describe("SearchAreaButton", () => {
  it("offers to search the area in view once the map is moved well away from where the search framed it", () => {
    renderAt(viewAround(BRIGHTON, 4));
    expect(button()).toBeNull();
    act(() => leaflet.show(viewAround(HOVE, 5)));
    expect(button()).not.toBeNull();
  });

  it("counts moves of the whole map, so raising what covers it and nudging the map offers nothing", () => {
    const framed = viewAround(BRIGHTON, 5);
    leaflet.start(framed);
    const { rerender } = render(<SearchAreaButton centred settled coveredBelow={() => 0} onSearch={vi.fn(() => true)} />);
    rerender(<SearchAreaButton centred settled coveredBelow={(height) => (height * 3) / 4} onSearch={vi.fn(() => true)} />);
    act(() => leaflet.show({ ...framed, north: framed.north + 0.001, south: framed.south + 0.001 }));
    expect(button()).toBeNull();
  });

  it("hears a move made as it renders again", () => {
    leaflet.start(viewAround(BRIGHTON, 5));
    const { rerender } = render(
      <>
        <Framer />
        <SearchAreaButton centred settled={false} onSearch={vi.fn(() => true)} />
      </>,
    );
    rerender(
      <>
        <Framer view={viewAround(HOVE, 5)} />
        <SearchAreaButton centred settled onSearch={vi.fn(() => true)} />
      </>,
    );
    expect(button()).not.toBeNull();
  });

  it("hands focus to the map when its search starts and it goes, rather than dropping it, and keeps it until then", () => {
    leaflet.start(viewAround(BRIGHTON, 5));
    const { rerender } = render(<SearchAreaButton centred settled onSearch={vi.fn(() => true)} />);
    act(() => leaflet.show(viewAround(HOVE, 5)));
    button()!.focus();
    rerender(<SearchAreaButton centred settled onSearch={vi.fn(() => true)} />);
    expect(document.activeElement).toBe(button());
    rerender(<SearchAreaButton centred settled={false} onSearch={vi.fn(() => true)} />);
    expect(document.activeElement).toBe(leaflet.container);
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

  it("searches from the middle of the part of the map left uncovered", async () => {
    const nearest = vi.spyOn(api, "nearest").mockResolvedValue({ found: true, postcode: "BN3 1FG" });
    const view = viewAround(HOVE, 5);
    renderAt(view, { coveredBelow: (height) => height / 2 });
    press();
    await waitFor(() => expect(nearest).toHaveBeenCalled());
    // A quarter of the way down, halfway down the top half left in view.
    expect(nearest).toHaveBeenCalledWith(expect.closeTo(view.north - (view.north - view.south) / 4, 6), expect.closeTo(HOVE.lng, 6));
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
