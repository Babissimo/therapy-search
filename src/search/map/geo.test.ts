import { describe, expect, it } from "vitest";
import { choosePoint, milesBetween } from "./geo";

const BRIGHTON = { lat: 50.8225, lng: -0.1372 };
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
