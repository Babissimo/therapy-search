// @vitest-environment jsdom
import { render } from "@testing-library/react";
import L from "leaflet";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Map } from "@/components/ui/map";
import { FitView } from "./FitView";

const BRIGHTON = { lat: 50.82, lng: -0.14 };
const HOVE = { lat: 50.83, lng: -0.17 };
const spyFit = () =>
  vi.spyOn(L.Map.prototype, "fitBounds").mockImplementation(function (this: L.Map) {
    return this;
  });
const onMap = (fitView: ReactNode) => (
  <Map center={[54.5, -3]} zoom={5} style={{ height: 400, width: 400 }}>
    {fitView}
  </Map>
);
/** A framing's bounds as [south, west, north, east], to two places. */
const framed = (fit: ReturnType<typeof spyFit>, call = 0) => {
  const bounds = fit.mock.calls[call]![0] as L.LatLngBounds;
  return [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].map((n) => Number(n.toFixed(2)));
};

afterEach(() => vi.restoreAllMocks());

describe("FitView", () => {
  it("frames the circle the pins reach, no closer than street level, and again only as more pins or a new search arrive", () => {
    const fit = spyFit();
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
    // A mile each way of Brighton.
    expect(framed(fit)).toEqual([50.81, -0.16, 50.83, -0.12]);
    expect(fit.mock.calls[0]?.[1]).toMatchObject({ maxZoom: 14 });
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
    // Load more placed a pin 12 miles north.
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={12} points={[HOVE, { lat: 51, lng: -0.14 }]} waiting={false} />));
    expect(fit).toHaveBeenCalledTimes(2);
    const [south, , north] = framed(fit, 1);
    // 24 miles from edge to edge is about 0.35 degrees of latitude.
    expect(north! - south!).toBeCloseTo(0.35, 1);
    rerender(onMap(<FitView fitKey="b" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} />));
    expect(fit).toHaveBeenCalledTimes(3);
  });

  it("frames the whole area searched when there are no pins", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[]} waiting={false} />));
    const [south, , north] = framed(fit);
    // 60 miles from edge to edge is about 0.87 degrees of latitude.
    expect(north! - south!).toBeCloseTo(0.87, 1);
  });

  it("waits until it may frame", () => {
    const fit = spyFit();
    const { rerender } = render(onMap(<FitView fitKey="a" points={[BRIGHTON]} waiting />));
    expect(fit).not.toHaveBeenCalled();
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
  });

  it("frames the pins alone when there is no centre", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" points={[BRIGHTON, { lat: 50.9, lng: -0.2 }]} waiting={false} />));
    expect(framed(fit)).toEqual([50.82, -0.2, 50.9, -0.14]);
  });

  it("does nothing with neither a centre nor pins", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" points={[]} waiting={false} />));
    expect(fit).not.toHaveBeenCalled();
  });

  it("goes back to the whole UK when nothing is searched", () => {
    spyFit();
    const view = vi.spyOn(L.Map.prototype, "setView");
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} />));
    // The map set its own first view as it mounted.
    view.mockClear();
    rerender(onMap(<FitView fitKey="" points={[]} waiting={false} />));
    expect(view).toHaveBeenCalledWith([54.5, -3], 5);
  });

  it("leaves a view restored for this search alone until pins arrive beyond those it had", () => {
    const fit = spyFit();
    const restored = { fitKey: "a", pins: 1 };
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} restored={restored} />));
    expect(fit).not.toHaveBeenCalled();
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={12} points={[HOVE, { lat: 51, lng: -0.14 }]} waiting={false} restored={restored} />));
    expect(fit).toHaveBeenCalledOnce();
  });
});
