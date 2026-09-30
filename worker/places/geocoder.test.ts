import { describe, expect, it, vi } from "vitest";
import type { Fetch } from "../ukcp/client";
import { GeocodeError, Geocoder } from "./geocoder";

const P = "https://api.postcodes.io";
const N = "https://nominatim.openstreetmap.org";

const json = (body: unknown, status = 200) => () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const missing = json({ status: 404, error: "Not found" }, 404);

/** A stub upstream that answers by URL; any other request fails the test. */
function upstream(routes: Record<string, () => Response>) {
  const fetch = vi.fn<Fetch>(async (url) => {
    const route = routes[url];
    if (!route) throw new Error(`unexpected request to ${url}`);
    return route();
  });
  return { geocoder: new Geocoder(fetch, "test-agent"), fetch };
}

describe("Geocoder.lookup", () => {
  it("places a full postcode exactly, identifying itself", async () => {
    const { geocoder, fetch } = upstream({ [`${P}/postcodes/BN3%201FG`]: json({ result: { latitude: 50.826, longitude: -0.16 } }) });
    await expect(geocoder.lookup(" BN31FG")).resolves.toEqual({ found: true, kind: "postcode", candidates: [{ lat: 50.826, lng: -0.16 }] });
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("User-Agent")).toBe("test-agent");
  });

  it("falls back from a retired postcode to its outcode", async () => {
    const { geocoder } = upstream({
      [`${P}/postcodes/BN3%201FG`]: missing,
      [`${P}/outcodes/BN3`]: json({ result: { latitude: 50.835, longitude: -0.178 } }),
    });
    await expect(geocoder.lookup("BN3 1FG")).resolves.toEqual({ found: true, kind: "outcode", candidates: [{ lat: 50.835, lng: -0.178 }] });
  });

  it("treats a postcode with no recorded position as unknown", async () => {
    const { geocoder } = upstream({
      [`${P}/postcodes/BN3%201FG`]: json({ result: { latitude: null, longitude: null } }),
      [`${P}/outcodes/BN3`]: json({ result: { latitude: 50.835, longitude: -0.178 } }),
    });
    await expect(geocoder.lookup("BN3 1FG")).resolves.toMatchObject({ found: true, kind: "outcode" });
  });

  it("falls back from an unknown outcode to the place name beside it", async () => {
    const { geocoder } = upstream({
      [`${P}/outcodes/ZZ9`]: missing,
      [`${P}/places?q=BRIGHTON&limit=10`]: json({ result: [{ latitude: 50.822, longitude: -0.138, local_type: "Other Settlement" }] }),
    });
    await expect(geocoder.lookup("Brighton ZZ9")).resolves.toEqual({
      found: true,
      kind: "place",
      candidates: [{ lat: 50.822, lng: -0.138, type: "other settlement" }],
    });
  });

  it("returns every candidate for an ambiguous card place name", async () => {
    const { geocoder } = upstream({
      [`${P}/places?q=BRIGHTON&limit=10`]: json({
        result: [
          { latitude: 50.352, longitude: -4.947, local_type: "Hamlet" },
          { latitude: 50.822, longitude: -0.138, local_type: "Other Settlement" },
        ],
      }),
    });
    const lookup = await geocoder.lookup("Brighton");
    expect(lookup).toMatchObject({ found: true, kind: "place" });
    expect(lookup.found && lookup.candidates.map((c) => c.type)).toEqual(["hamlet", "other settlement"]);
  });

  it("asks Nominatim, within the UK, for a search centre", async () => {
    const { geocoder } = upstream({
      [`${N}/search?q=BRIGHTON&format=jsonv2&limit=1&countrycodes=gb`]: json([{ lat: "50.8214626", lon: "-0.1400561", addresstype: "city" }]),
    });
    await expect(geocoder.lookup("Brighton", { centre: true })).resolves.toEqual({
      found: true,
      kind: "place",
      candidates: [{ lat: 50.8214626, lng: -0.1400561, type: "city" }],
    });
  });

  it("asks Nominatim worldwide for places in an outside-UK search", async () => {
    const { geocoder } = upstream({ [`${N}/search?q=PARIS&format=jsonv2&limit=10`]: json([{ lat: "48.85", lon: "2.35", addresstype: "city" }]) });
    await expect(geocoder.lookup("Paris", { outsideUK: true })).resolves.toMatchObject({ found: true, kind: "place" });
  });

  it("asks Nominatim within a given country for the text whole, whatever UK postcode it resembles", async () => {
    const { geocoder, fetch } = upstream({
      [`${N}/search?q=DUBLIN+D02+AF30&format=jsonv2&limit=1&countrycodes=ie`]: json([{ lat: "53.34", lon: "-6.26", addresstype: "city" }]),
    });
    await expect(geocoder.lookup("Dublin D02 AF30", { centre: true, country: "ie" })).resolves.toMatchObject({ found: true, kind: "place" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports text too general to place without asking anyone", async () => {
    const { geocoder, fetch } = upstream({});
    await expect(geocoder.lookup(" BN")).resolves.toEqual({ found: false, reason: "too-general" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a place nobody knows as not found", async () => {
    const { geocoder } = upstream({ [`${P}/places?q=NOWHERE&limit=10`]: json({ result: null }) });
    await expect(geocoder.lookup("Nowhere")).resolves.toEqual({ found: false, reason: "not-found" });
  });

  it("throws on an upstream failure, naming the service but not the text", async () => {
    const { geocoder } = upstream({ [`${P}/outcodes/BN3`]: json({}, 500) });
    const failure = geocoder.lookup("BN3");
    await expect(failure).rejects.toBeInstanceOf(GeocodeError);
    await expect(failure).rejects.toThrow("api.postcodes.io answered 500");
  });
});

describe("Geocoder.nearest", () => {
  it("finds the postcode nearest a point, as far out as postcodes.io looks", async () => {
    const { geocoder } = upstream({ [`${P}/postcodes?lon=-0.16&lat=50.826&radius=2000&limit=1`]: json({ result: [{ postcode: "BN3 1FG" }] }) });
    await expect(geocoder.nearest(50.826, -0.16)).resolves.toEqual({ found: true, postcode: "BN3 1FG" });
  });

  it("reports a point with no postcode within reach as not found", async () => {
    const { geocoder } = upstream({ [`${P}/postcodes?lon=-3&lat=59&radius=2000&limit=1`]: json({ result: null }) });
    await expect(geocoder.nearest(59, -3)).resolves.toEqual({ found: false });
  });
});
