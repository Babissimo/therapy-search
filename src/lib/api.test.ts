// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, UNREADABLE } from "./api";

const RESULTS = `<span class="results-no">1-1 of 1 results</span><div class="profile-listing"><a href="therapist/Jo-Bloggs-ABCDEFGH"><h2>Jo Bloggs</h2></a></div>`;
const answer = (body: string, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
/** Each request made, as its address, method and body: what Cloudflare's request analytics could record is the address. */
const sent = () => vi.mocked(fetch).mock.calls.map(([url, init]) => [url, init?.method, String(init?.body)]);

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("reads UKCP's HTML in the browser, leaving a card's details until it is shown", async () => {
    answer(RESULTS);
    const found = await api.search("Location=Leeds");
    expect(found).toMatchObject({ total: 1, listings: [{ slug: "Jo-Bloggs-ABCDEFGH" }] });
    expect(found.listings[0]?.read()).toMatchObject({ slug: "Jo-Bloggs-ABCDEFGH", name: "Jo Bloggs" });
  });

  it("sends a search in the request's body, never its address", async () => {
    answer(RESULTS);
    await api.search("Location=Leeds&HelpWith=Anxiety");
    await api.searchEarly("Location=Leeds");
    expect(sent()).toEqual([
      ["/api/search", "POST", "Location=Leeds&HelpWith=Anxiety"],
      ["/api/search/early", "POST", "Location=Leeds"],
    ]);
  });

  it("asks for a profile and its contact details by body", async () => {
    answer(`<div class="therapist-contacts-details-tel"></div>`);
    await api.contact("9239");
    await api.profile("Zoë-O'Neill-QWERTY12").catch(() => {});
    expect(sent()).toEqual([
      ["/api/contact", "POST", "id=9239"],
      ["/api/therapist", "POST", "slug=Zo%C3%AB-O%27Neill-QWERTY12"],
    ]);
  });

  it("asks about a card's office by body, four at most at a time", async () => {
    const pending: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => pending.push(() => resolve(new Response(JSON.stringify({ postcode: "BN3 2FL", cost: "£70" })))))),
    );
    const answers = ["a", "b", "c", "d", "e"].map((slug) => api.office(`Jo-Bloggs-${slug}`, "HOVE BN3"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent()).toHaveLength(4);
    expect(sent()[0]).toEqual(["/api/office", "POST", "slug=Jo-Bloggs-a&location=HOVE+BN3"]);
    pending.shift()?.();
    await expect(answers[0]).resolves.toEqual({ postcode: "BN3 2FL", cost: "£70" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent()).toHaveLength(5);
    for (const answer of pending) answer();
    await Promise.all(answers);
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

  it("looks a place up by its canonical query, sent as the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ found: false, reason: "not-found" })));
    await expect(api.place(" Brighton bn3", { centre: true })).resolves.toEqual({ found: false, reason: "not-found" });
    expect(sent()).toEqual([["/api/place", "POST", "q=BRIGHTON+BN3&centre=true"]]);
  });

  it("asks for the postcode nearest a point rounded to about 100 metres, sent as the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ found: true, postcode: "BN3 1FG" })));
    await expect(api.nearest(50.82614, -0.15987)).resolves.toEqual({ found: true, postcode: "BN3 1FG" });
    expect(sent()).toEqual([["/api/nearest", "POST", "lat=50.826&lng=-0.160"]]);
  });

  it("passes on the Worker's error for a place lookup", async () => {
    answer(JSON.stringify({ error: "Couldn't look up that place just now." }), 502);
    await expect(api.place("BN3")).rejects.toMatchObject({ status: 502, message: "Couldn't look up that place just now." });
  });
});
