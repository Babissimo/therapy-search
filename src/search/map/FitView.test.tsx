// @vitest-environment jsdom
import { render } from "@testing-library/react";
import L from "leaflet";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Map } from "@/components/ui/map";
import { FitView } from "./FitView";

const BRIGHTON = { lat: 50.82, lng: -0.14 };
const HOVE = { lat: 50.83, lng: -0.17 };
/** Frames at once, as a fit without animation does, or leaves the move under way until the map is told it has ended. */
const spyFit = ({ animating = false } = {}) =>
  vi.spyOn(L.Map.prototype, "fitBounds").mockImplementation(function (this: L.Map) {
    return animating ? this : this.fire("moveend");
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
  it("frames the centre and the pins, no closer than street level, and again only as more therapists or a new search arrive", () => {
    const fit = spyFit();
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE]} placed={1} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
    expect(framed(fit)).toEqual([50.82, -0.17, 50.83, -0.14]);
    expect(fit.mock.calls[0]?.[1]).toMatchObject({ maxZoom: 14 });
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE]} placed={1} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
    // Load more placed a therapist 12 miles north.
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE, { lat: 51, lng: -0.14 }]} placed={2} waiting={false} />));
    expect(fit).toHaveBeenCalledTimes(2);
    expect(framed(fit, 1)).toEqual([50.82, -0.17, 51, -0.14]);
    rerender(onMap(<FitView fitKey="b" centre={BRIGHTON} points={[HOVE]} placed={1} waiting={false} />));
    expect(fit).toHaveBeenCalledTimes(3);
  });

  it("leaves the frame alone when a stack splits into more pins with no one new placed", () => {
    const fit = spyFit();
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE]} placed={2} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
    // One of the two at Hove moved to their office's postcode.
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE, { lat: 50.84, lng: -0.18 }]} placed={2} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
  });

  it("frames the whole area searched when no card is placed", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[]} placed={0} waiting={false} />));
    const [south, , north] = framed(fit);
    // 60 miles from edge to edge is about 0.87 degrees of latitude.
    expect(north! - south!).toBeCloseTo(0.87, 1);
  });

  it("frames above whatever covers the map's bottom", () => {
    const fit = spyFit();
    // A fresh point each time, as Leaflet halves some in place.
    vi.spyOn(L.Map.prototype, "getSize").mockImplementation(() => L.point(400, 800));
    const { rerender } = render(
      onMap(<FitView fitKey="a" centre={BRIGHTON} points={[]} placed={0} waiting={false} coveredBelow={(height) => height / 2} />),
    );
    expect(fit.mock.calls[0]?.[1]).toMatchObject({ paddingTopLeft: [48, 136], paddingBottomRight: [48, 448] });
    rerender(onMap(<FitView fitKey="b" centre={BRIGHTON} points={[]} placed={0} waiting={false} />));
    expect(fit.mock.calls[1]?.[1]).toMatchObject({ paddingTopLeft: [48, 136], paddingBottomRight: [48, 48] });
  });

  it("keeps room to frame into on a map too short for all that covers it", () => {
    const fit = spyFit();
    vi.spyOn(L.Map.prototype, "getSize").mockImplementation(() => L.point(800, 400));
    render(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[]} placed={0} waiting={false} coveredBelow={(height) => height / 2} />));
    // 128px left beneath the toolbar's 136 and the 48 margin, of the 200 covered.
    expect(fit.mock.calls[0]?.[1]).toMatchObject({ paddingBottomRight: [48, 136] });
  });

  it("waits until it may frame", () => {
    const fit = spyFit();
    const { rerender } = render(onMap(<FitView fitKey="a" points={[BRIGHTON]} placed={1} waiting />));
    expect(fit).not.toHaveBeenCalled();
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE]} placed={1} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
  });

  it("frames the pins alone when there is no centre", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" points={[BRIGHTON, { lat: 50.9, lng: -0.2 }]} placed={2} waiting={false} />));
    expect(framed(fit)).toEqual([50.82, -0.2, 50.9, -0.14]);
  });

  it("does nothing with neither a centre nor pins", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" points={[]} placed={0} waiting={false} />));
    expect(fit).not.toHaveBeenCalled();
  });

  it("leaves a view restored for this search alone until therapists are placed beyond those it had", () => {
    const fit = spyFit();
    const restored = { fitKey: "a", placed: 1 };
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE]} placed={1} waiting={false} restored={restored} />));
    expect(fit).not.toHaveBeenCalled();
    rerender(
      onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE, { lat: 51, lng: -0.14 }]} placed={2} waiting={false} restored={restored} />),
    );
    expect(fit).toHaveBeenCalledOnce();
  });

  it("frames again each time the visitor asks to recentre, even a view restored for this search", () => {
    const fit = spyFit();
    const restored = { fitKey: "a", placed: 1 };
    const fitView = (recentres: number) => (
      <FitView fitKey="a" centre={BRIGHTON} points={[HOVE]} placed={1} waiting={false} restored={restored} recentres={recentres} />
    );
    const { rerender } = render(onMap(fitView(0)));
    expect(fit).not.toHaveBeenCalled();
    rerender(onMap(fitView(1)));
    expect(fit).toHaveBeenCalledOnce();
    rerender(onMap(fitView(1)));
    expect(fit).toHaveBeenCalledOnce();
    rerender(onMap(fitView(2)));
    expect(fit).toHaveBeenCalledTimes(2);
    expect(framed(fit, 1)).toEqual(framed(fit, 0));
  });

  it("tells the pane once it has framed, jumping there when asked to", () => {
    const fit = spyFit();
    const onFramed = vi.fn();
    const { rerender } = render(onMap(<FitView fitKey="a" points={[BRIGHTON]} placed={1} waiting instant onFramed={onFramed} />));
    expect(onFramed).not.toHaveBeenCalled();
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE]} placed={1} waiting={false} instant onFramed={onFramed} />));
    expect(fit.mock.calls[0]?.[1]).toMatchObject({ animate: false });
    expect(onFramed).toHaveBeenCalledOnce();
    // Load more placed a therapist further out, with the tiles drawn by now: Leaflet decides whether to animate.
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE, { lat: 51, lng: -0.14 }]} placed={2} waiting={false} onFramed={onFramed} />));
    expect(fit.mock.calls[1]?.[1]).not.toHaveProperty("animate");
  });

  it("tells the pane only once an animated framing comes to rest", () => {
    const fit = spyFit({ animating: true });
    const onFramed = vi.fn();
    render(onMap(<FitView fitKey="a" centre={BRIGHTON} points={[HOVE]} placed={1} waiting={false} onFramed={onFramed} />));
    expect(onFramed).not.toHaveBeenCalled();
    (fit.mock.contexts[0] as L.Map).fire("moveend");
    expect(onFramed).toHaveBeenCalledOnce();
  });

  it("tells the pane when there is nothing to frame", () => {
    const onFramed = vi.fn();
    render(onMap(<FitView fitKey="a" points={[]} placed={0} waiting={false} onFramed={onFramed} />));
    expect(onFramed).toHaveBeenCalled();
  });
});
