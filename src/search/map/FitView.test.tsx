// @vitest-environment jsdom
import { render } from "@testing-library/react";
import L from "leaflet";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Map } from "@/components/ui/map";
import { FitView } from "./FitView";

const BRIGHTON = { lat: 50.82, lng: -0.14 };
const spyFit = () =>
  vi.spyOn(L.Map.prototype, "fitBounds").mockImplementation(function (this: L.Map) {
    return this;
  });
const onMap = (fitView: ReactNode) => (
  <Map center={[54.5, -3]} zoom={5} style={{ height: 400, width: 400 }}>
    {fitView}
  </Map>
);

afterEach(() => vi.restoreAllMocks());

describe("FitView", () => {
  it("frames the distance circle once per search", () => {
    const fit = spyFit();
    const { rerender } = render(onMap(<FitView fitKey="a" centre={BRIGHTON} radiusMiles={5} points={[]} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} radiusMiles={6} points={[BRIGHTON]} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
    rerender(onMap(<FitView fitKey="b" centre={BRIGHTON} radiusMiles={6} points={[]} waiting={false} />));
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it("waits until it may frame", () => {
    const fit = spyFit();
    const { rerender } = render(onMap(<FitView fitKey="a" radiusMiles={5} points={[BRIGHTON]} waiting />));
    expect(fit).not.toHaveBeenCalled();
    rerender(onMap(<FitView fitKey="a" centre={BRIGHTON} radiusMiles={5} points={[]} waiting={false} />));
    expect(fit).toHaveBeenCalledOnce();
  });

  it("frames the pins, no closer than street level, when there is no centre", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" radiusMiles={5} points={[BRIGHTON, { lat: 50.9, lng: -0.2 }]} waiting={false} />));
    expect(fit.mock.calls[0]?.[1]).toEqual({ maxZoom: 13, padding: [32, 32] });
  });

  it("leaves a view restored for this search alone", () => {
    const fit = spyFit();
    render(onMap(<FitView fitKey="a" centre={BRIGHTON} radiusMiles={5} points={[]} waiting={false} restoredFor="a" />));
    expect(fit).not.toHaveBeenCalled();
  });
});
