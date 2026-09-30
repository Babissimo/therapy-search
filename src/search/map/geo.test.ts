import { describe, expect, it } from "vitest";
import { choosePoint, milesBetween, movedElsewhere, type Point, type View } from "./geo";
import { viewAround } from "./geo.testing";

const BRIGHTON = { lat: 50.8225, lng: -0.1372 };
const HOVE = { lat: 50.835, lng: -0.178 };

describe("movedElsewhere", () => {
  const FRAMED = viewAround(BRIGHTON, 5);
  const middle = (view: View) => ({ lat: (view.north + view.south) / 2, lng: (view.east + view.west) / 2 });
  /** Aimed at the middle of `view`, as when nothing covers the map. */
  const moved = (view: View, framed: View, centre?: Point) => movedElsewhere(view, framed, middle(view), centre);

  it("counts a view moved well away from where the search framed it", () => {
    expect(moved(viewAround(HOVE, 5), FRAMED, BRIGHTON)).toBe(true);
  });

  it("counts no move while the middle is within a quarter of the view of where it was framed", () => {
    expect(moved(viewAround(HOVE, 10), FRAMED, BRIGHTON)).toBe(false);
  });

  it("counts no move of half a mile or less, however far in the map is zoomed", () => {
    const nearBrighton = { lat: BRIGHTON.lat + 0.4 / 69.05, lng: BRIGHTON.lng };
    expect(moved(viewAround(nearBrighton, 1), FRAMED, BRIGHTON)).toBe(false);
  });

  it("counts no move to a view wider than a search reaches across", () => {
    const farFromBrighton = { lat: 52.5, lng: -1.9 };
    expect(moved(viewAround(farFromBrighton, 61), FRAMED, BRIGHTON)).toBe(false);
    expect(moved(viewAround(farFromBrighton, 59), FRAMED, BRIGHTON)).toBe(true);
  });

  it("counts any view narrow enough, even zoomed straight in, when a search was framed too wide to mean a place", () => {
    const midlands = { lat: 52.5, lng: -1.9 };
    expect(moved(viewAround(midlands, 5), viewAround(midlands, 400))).toBe(true);
    // As when a pin far out stretches the frame of a search at Brighton up to the Midlands.
    expect(moved(viewAround(midlands, 20), viewAround(midlands, 180), BRIGHTON)).toBe(true);
  });

  it("counts no move zoomed in on a search's own centre, however far from it the frame's middle lies", () => {
    const sherborne = { lat: 50.95, lng: -2.52 };
    // A frame stretched north by a pin far out, as a search's frame takes in every pin.
    const framed = viewAround({ lat: sherborne.lat + 20 / 69.05, lng: sherborne.lng }, 80);
    expect(moved(viewAround(sherborne, 20), framed, sherborne)).toBe(false);
    expect(moved(viewAround(sherborne, 20), framed)).toBe(true);
  });

  it("measures from the search's centre where the view is aimed, rather than the middle of the whole map", () => {
    const framed = viewAround({ lat: BRIGHTON.lat + 20 / 69.05, lng: BRIGHTON.lng }, 50);
    // The part left uncovered, at the top of the map, is centred on Brighton; the whole map's middle is south of it.
    const view = viewAround({ lat: BRIGHTON.lat - 2 / 69.05, lng: BRIGHTON.lng }, 5);
    expect(movedElsewhere(view, framed, BRIGHTON, BRIGHTON)).toBe(false);
    expect(movedElsewhere(view, framed, middle(view), BRIGHTON)).toBe(true);
  });
});
const CORNWALL_HAMLET = { lat: 50.352, lng: -4.947, type: "hamlet" };
const BRIGHTON_CITY = { lat: 50.822, lng: -0.138, type: "other settlement" };

describe("milesBetween", () => {
  it("measures great-circle distance in miles", () => {
    // Brighton to central London is about 47 miles as the crow flies.
    expect(milesBetween(BRIGHTON, { lat: 51.5074, lng: -0.1278 })).toBeCloseTo(47.3, 0);
  });
});

describe("choosePoint", () => {
  it("takes a postcode's only candidate", () => {
    const lookup = { found: true as const, kind: "postcode" as const, candidates: [{ lat: 1, lng: 2 }] };
    expect(choosePoint(lookup)).toEqual({ lat: 1, lng: 2 });
  });

  it("takes the place nearest the search centre", () => {
    const lookup = { found: true as const, kind: "place" as const, candidates: [CORNWALL_HAMLET, BRIGHTON_CITY] };
    expect(choosePoint(lookup, BRIGHTON)).toEqual({ lat: BRIGHTON_CITY.lat, lng: BRIGHTON_CITY.lng });
  });

  it("takes the most settled place when there is no centre, keeping the geocoder's order on ties", () => {
    const lookup = { found: true as const, kind: "place" as const, candidates: [CORNWALL_HAMLET, BRIGHTON_CITY] };
    expect(choosePoint(lookup)).toEqual({ lat: BRIGHTON_CITY.lat, lng: BRIGHTON_CITY.lng });
    const tie = { found: true as const, kind: "place" as const, candidates: [{ lat: 1, lng: 1, type: "town" }, { lat: 2, lng: 2, type: "town" }] };
    expect(choosePoint(tie)).toEqual({ lat: 1, lng: 1 });
  });
});
