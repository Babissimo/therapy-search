import { describe, expect, it } from "vitest";
import { areaToSearch, choosePoint, milesBetween } from "./geo";
import { viewAround } from "./geo.testing";

const BRIGHTON = { lat: 50.8225, lng: -0.1372 };
const HOVE = { lat: 50.835, lng: -0.178 };

describe("areaToSearch", () => {
  const FRAMED = viewAround(BRIGHTON, 5);

  it("offers the middle of a view moved well away from where the search framed it", () => {
    const area = areaToSearch(viewAround(HOVE, 5), FRAMED, true);
    expect(area?.lat).toBeCloseTo(HOVE.lat, 6);
    expect(area?.lng).toBeCloseTo(HOVE.lng, 6);
  });

  it("offers nothing while the middle is within a quarter of the view of where it was framed", () => {
    expect(areaToSearch(viewAround(HOVE, 10), FRAMED, true)).toBeUndefined();
  });

  it("offers nothing for a move of half a mile or less, however far in the map is zoomed", () => {
    const nearBrighton = { lat: BRIGHTON.lat + 0.4 / 69.05, lng: BRIGHTON.lng };
    expect(areaToSearch(viewAround(nearBrighton, 1), FRAMED, true)).toBeUndefined();
  });

  it("offers nothing while the view is wider than a search reaches across", () => {
    const farFromBrighton = { lat: 52.5, lng: -1.9 };
    expect(areaToSearch(viewAround(farFromBrighton, 61), FRAMED, true)).toBeUndefined();
    expect(areaToSearch(viewAround(farFromBrighton, 59), FRAMED, true)).toBeDefined();
  });

  it("offers any view narrow enough, even zoomed straight in, when a search with no centre was framed too wide to mean a place", () => {
    const midlands = { lat: 52.5, lng: -1.9 };
    expect(areaToSearch(viewAround(midlands, 5), viewAround(midlands, 400), false)).toBeDefined();
  });

  it("offers nothing zoomed straight in on a search's own centre, however wide it was framed", () => {
    const sherborne = { lat: 50.95, lng: -2.52 };
    expect(areaToSearch(viewAround(sherborne, 40), viewAround(sherborne, 80), true)).toBeUndefined();
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
