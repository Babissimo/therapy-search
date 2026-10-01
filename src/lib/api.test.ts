// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOOKUP_VERSION } from "@shared/location";
import { api, OFFLINE, STALLED, UNREADABLE } from "./api";

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
    expect(sent()).toEqual([["/api/search", "POST", "Location=Leeds&HelpWith=Anxiety"]]);
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

  it("asks for an office's postcode by body, four at most at a time", async () => {
    const pending: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => pending.push(() => resolve(new Response(JSON.stringify({ found: true, postcode: "BN3 2FL" })))))),
    );
    const answers = ["a", "b", "c", "d", "e"].map((slug) => api.office(`Jo-Bloggs-${slug}`, "BN3"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent()).toHaveLength(4);
    expect(sent()[0]).toEqual(["/api/office", "POST", "slug=Jo-Bloggs-a&outcode=BN3"]);
    pending.shift()?.();
    await expect(answers[0]).resolves.toEqual({ found: true, postcode: "BN3 2FL" });
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
    expect(sent()).toEqual([["/api/place", "POST", `q=BRIGHTON+BN3&centre=true&v=${LOOKUP_VERSION}`]]);
  });

  it("asks for the postcode nearest a point rounded to about 100 metres, sent as the body", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ found: true, postcode: "BN3 1FG" })));
    await expect(api.nearest(50.82614, -0.15987)).resolves.toEqual({ found: true, postcode: "BN3 1FG" });
    expect(sent()).toEqual([["/api/nearest", "POST", `lat=50.826&lng=-0.160&v=${LOOKUP_VERSION}`]]);
  });

  it("passes on the Worker's error for a place lookup", async () => {
    answer(JSON.stringify({ error: "Couldn't look up that place just now." }), 502);
    await expect(api.place("BN3")).rejects.toMatchObject({ status: 502, message: "Couldn't look up that place just now." });
  });

  it("says plainly when the connection is down, in place of the browser's own words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(api.search("Location=Leeds")).rejects.toMatchObject({ status: 0, message: OFFLINE });
    await expect(api.place("BN3")).rejects.toMatchObject({ message: OFFLINE });
  });

  it("gives up on a request that stalls, and says so", async () => {
    vi.useFakeTimers();
    const abandoned = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener("abort", () => {
              abandoned();
              reject(new DOMException("The operation was aborted.", "AbortError"));
            }),
          ),
      ),
    );
    const search = expect(api.search("Location=Leeds")).rejects.toMatchObject({ status: 0, message: STALLED });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(abandoned).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    await search;
    expect(abandoned).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("lets a caller that stops waiting hear its own reason, not a stall", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)))),
    );
    const gone = new AbortController();
    const office = api.office("Jo-Bloggs-a", "BN3", gone.signal);
    await new Promise((resolve) => setTimeout(resolve, 0));
    gone.abort(new DOMException("Left the page", "AbortError"));
    await expect(office).rejects.toMatchObject({ name: "AbortError", message: "Left the page" });
  });
});
