// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOOKUP_VERSION } from "@shared/location";
import { api, UNREADABLE } from "./api";

const answer = (body: string, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("reads UKCP's HTML in the browser, leaving a card's details until it is shown", async () => {
    answer(`<span class="results-no">1-1 of 1 results</span><div class="profile-listing"><a href="therapist/Jo-Bloggs-ABCDEFGH"><h2>Jo Bloggs</h2></a></div>`);
    const found = await api.search("Location=Leeds");
    expect(found).toMatchObject({ total: 1, listings: [{ slug: "Jo-Bloggs-ABCDEFGH" }] });
    expect(found.listings[0]?.read()).toMatchObject({ slug: "Jo-Bloggs-ABCDEFGH", name: "Jo Bloggs" });
    expect(fetch).toHaveBeenCalledWith("/api/search?Location=Leeds", undefined);
  });

  it("reports a card it can't read as UKCP having changed, once the card is shown", async () => {
    answer(`<span class="results-no">1-1 of 1 results</span><div class="profile-listing"><a href="therapist/Jo-Bloggs-ABCDEFGH"></a></div>`);
    const [listing] = (await api.search("")).listings;
    expect(() => listing?.read()).toThrow(expect.objectContaining({ status: 502, message: UNREADABLE }));
  });

  it("passes on the Worker's error message", async () => {
    answer(JSON.stringify({ error: "Too many searches in a short time." }), 429);
    await expect(api.profile("Jo-Bloggs-ABCDEFGH")).rejects.toMatchObject({ status: 429, message: "Too many searches in a short time." });
  });

  it("reports a page it can't read as UKCP having changed", async () => {
    answer("<p>A redesigned page</p>");
    await expect(api.search("")).rejects.toMatchObject({ status: 502, message: UNREADABLE });
  });

  it("looks a place up by its canonical query", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ found: false, reason: "not-found" })));
    await expect(api.place(" Brighton bn3", { centre: true })).resolves.toEqual({ found: false, reason: "not-found" });
    expect(fetch).toHaveBeenCalledWith(`/api/place?q=BRIGHTON+BN3&centre=true&v=${LOOKUP_VERSION}`);
  });

  it("asks for the postcode nearest a point rounded to about 100 metres", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ found: true, postcode: "BN3 1FG" })));
    await expect(api.nearest(50.82614, -0.15987)).resolves.toEqual({ found: true, postcode: "BN3 1FG" });
    expect(fetch).toHaveBeenCalledWith(`/api/nearest?lat=50.826&lng=-0.160&v=${LOOKUP_VERSION}`);
  });

  it("passes on the Worker's error for a place lookup", async () => {
    answer(JSON.stringify({ error: "Couldn't look up that place just now." }), 502);
    await expect(api.place("BN3")).rejects.toMatchObject({ status: 502, message: "Couldn't look up that place just now." });
  });
});
