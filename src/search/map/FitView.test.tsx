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
  it("frames the circle and the pins, no closer than street level, and again only as more pins or a new search arrive", () => {
    const fit = spyFit();
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
    // A mile each way of Brighton, and west to the pin in Hove, which is further.
    expect(framed(fit)).toEqual([50.81, -0.17, 50.83, -0.12]);
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

  it("frames again when the circle reaches further though no new pin arrives", () => {
    const fit = spyFit();
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} />));
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
    // Load more brought only cards at the pin already there, the furthest of them 4 miles out.
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={4} points={[HOVE]} waiting={false} />));
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it("takes in a pin beyond the circle", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[{ lat: 50.87, lng: 0.01 }]} waiting={false} />));
    expect(framed(fit)).toEqual([50.81, -0.16, 50.87, 0.01]);
  });

  it("frames the whole area searched when no card has a distance and there are no pins", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[]} waiting={false} />));
    const [south, , north] = framed(fit);
    // 60 miles from edge to edge is about 0.87 degrees of latitude.
    expect(north! - south!).toBeCloseTo(0.87, 1);
  });

  it("frames the whole area searched when every card is at the centre and none is placed", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={0} points={[]} waiting={false} />));
    const [south, , north] = framed(fit);
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

  it("leaves a view restored for this search alone until pins arrive beyond those it had", () => {
    const fit = spyFit();
    const restored = { fitKey: "a", pins: 1, reach: 1 };
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} restored={restored} />));
    expect(fit).not.toHaveBeenCalled();
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={12} points={[HOVE, { lat: 51, lng: -0.14 }]} waiting={false} restored={restored} />));
    expect(fit).toHaveBeenCalledOnce();
  });

  it("tells the pane once it has framed, jumping there when asked to", () => {
    const fit = spyFit();
    const onFramed = vi.fn();
    const { rerender } = render(onMap(<FitView fitKey="a" points={[BRIGHTON]} waiting instant onFramed={onFramed} />));
    expect(onFramed).not.toHaveBeenCalled();
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={1} points={[HOVE]} waiting={false} instant onFramed={onFramed} />));
    expect(fit.mock.calls[0]?.[1]).toMatchObject({ animate: false });
    expect(onFramed).toHaveBeenCalledOnce();
    // Load more placed a pin further out, with the tiles drawn by now: Leaflet decides whether to animate.
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} reachMiles={12} points={[HOVE, { lat: 51, lng: -0.14 }]} waiting={false} onFramed={onFramed} />));
    expect(fit.mock.calls[1]?.[1]).not.toHaveProperty("animate");
  });

  it("tells the pane when there is nothing to frame", () => {
    const onFramed = vi.fn();
    render(onMap(<FitView fitKey="a" points={[]} waiting={false} onFramed={onFramed} />));
    expect(onFramed).toHaveBeenCalled();
  });
});
