import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FILTER_GROUPS, groupName } from "../../shared/filterGroups";
import { readSeed } from "../../shared/order";
import { BATCH_SIZE, UKCP_ORIGIN, WHOLE_SET_SIZE } from "../../shared/query";
import { fixture } from "../../shared/ukcp/__fixtures__";
import { createCache, createGateway, TOO_MANY, UPSTREAM_DOWN, type Env, type PlaceFinder } from "../app";
import { UpstreamError, type UkcpClient } from "../ukcp/client";
import { INVALID, NEEDS_FILTER, NEW_TAB, NO_PLACE, UNREADABLE } from "./pages";

const bytes = (text: string) => new TextEncoder().encode(text);

/** A card of UKCP's results, `miles` from the place searched, or with no distance where null. */
function listing(n: number, { name = `Therapist ${n}`, summary = `Summary ${n}.`, miles = n / 10 as number | null } = {}) {
  return `<div class="profile-listing margin-b-md"><a href="therapist/Therapist-${n}-ABCDEFGH" class="light-anchor">
  <h2>${name}</h2><span class="profile-listing-locations"><strong>Bristol BS${n}</strong>${miles === null ? "" : ` (${miles} miles from Bristol)`}</span>
  <span class="profile-listing-contact-session-type">In-person&nbsp;&amp;&nbsp;Remote</span><p class="pt-2">${summary}</p></a></div>`;
}

/** A page of UKCP's results: `count` cards from `from`, of `total`. */
function results(count: number, { total = count, from = 1, place = "Bristol, City of Bristol, UK", cards = "" } = {}) {
  const listings = cards || Array.from({ length: count }, (_, i) => listing(from + i)).join("\n");
  return `<span class="d-block results-no">${from}-${from + count - 1} of ${total} results</span>
<span class="results-location">Location searched: <strong>${place}</strong></span>${listings}`;
}

function setup({ allow = true, client = {} as Partial<UkcpClient> } = {}) {
  const limit = vi.fn(async () => ({ success: allow }));
  const env: Env = {
    ASSETS: { fetch: vi.fn() },
    UPSTREAM_LIMIT: { limit },
    PLACE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    OFFICE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    EARLY_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
    UKCP_SESSION: { get: async () => null, put: async () => {} },
    SITE_URL: "https://example.test",
  };
  const stub = { search: vi.fn(async () => bytes(results(30))), profile: vi.fn(), contact: vi.fn(), ...client } as unknown as UkcpClient;
  const places = { lookup: vi.fn(), nearest: vi.fn() } as unknown as PlaceFinder;
  const cache = createCache(
    () => stub,
    () => places,
  );
  const forwarded = vi.fn(async (req: Request) => cache.fetch(req, env));
  const gateway = createGateway(() => ({ fetch: forwarded }));
  /** What the cached entrypoint was asked for, as path and query. */
  const asked = () => forwarded.mock.calls.map(([req]) => new URL(req.url).pathname + new URL(req.url).search);
  const request = (path: string, init?: RequestInit) => gateway.request(path, { ...init, headers: { "cf-connecting-ip": "203.0.113.9", ...init?.headers } }, env);
  const post = (path: string, body: string | Record<string, string>, headers?: Record<string, string>) =>
    request(path, { method: "POST", body: new URLSearchParams(body).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers } });
  return { request, post, asked, forwarded, stub, limit };
}

/**
 * UKCP's 30 cards nearest first, `miles` of each from the place, those alike in a new order on every call, as UKCP
 * reshuffles them about once a minute and an expired batch is fetched again.
 */
function reshuffling(miles: (n: number) => number) {
  let calls = 0;
  return vi.fn(async () => {
    calls++;
    const order = Array.from({ length: 30 }, (_, i) => i + 1).toSorted((a, b) => miles(a) - miles(b) || ((a + calls) % 5) - ((b + calls) % 5) || a - b);
    return bytes(results(30, { cards: order.map((n) => listing(n, { miles: miles(n) })).join("\n") }));
  });
}

/** The names on each page of a search, following More results to the last. */
async function pageThrough(post: ReturnType<typeof setup>["post"], search: string): Promise<string[][]> {
  const pages: string[][] = [];
  for (let body = search; body !== ""; ) {
    const { doc } = await read(await post("/plain", body));
    pages.push([...doc.querySelectorAll(".results h2")].map((h) => h.textContent ?? ""));
    const more = [...doc.querySelectorAll<HTMLFormElement>("form")].find((f) => f.textContent?.includes("More results"));
    body = more ? sent(more) : "";
  }
  return pages;
}

async function read(res: Response) {
  const text = await res.text();
  return { text, doc: new JSDOM(text).window.document };
}

/** A form's fields as it would send them, as a POST body. */
function sent(form: HTMLFormElement): string {
  const body = new URLSearchParams();
  for (const input of form.querySelectorAll("input")) if (input.type === "hidden") body.append(input.name, input.value);
  return body.toString();
}

afterEach(() => vi.restoreAllMocks());

describe("GET /plain", () => {
  it("answers the form, kept in no cache but the browser's for Back, and allowed no script", async () => {
    const { request, forwarded } = setup();
    const res = await request("/plain");
    expect([res.status, res.headers.get("Content-Type")]).toEqual([200, "text/html; charset=UTF-8"]);
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(res.headers.get("Content-Security-Policy")).toMatch(/^default-src 'none'; style-src 'unsafe-inline';/);
    const { doc } = await read(res);
    expect([doc.documentElement.lang, doc.title]).toEqual(["en-GB", "Plain search - Find a UKCP therapist (unofficial)"]);
    expect([doc.querySelectorAll("main h1").length, doc.querySelectorAll("script").length]).toEqual([1, 0]);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("posts the search, every field labelled, with the app's filter groups as fieldsets of checkboxes", async () => {
    const { doc } = await read(await setup().request("/plain"));
    const form = doc.querySelector("form")!;
    expect([form.getAttribute("method"), form.getAttribute("action")]).toEqual(["post", "/plain"]);
    for (const input of doc.querySelectorAll("input:not([type=hidden])")) expect(doc.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
    const groups = [...doc.querySelectorAll("details")];
    expect(groups.map((g) => g.querySelector("summary")?.textContent)).toEqual(FILTER_GROUPS.map(groupName));
    expect(groups.map((g) => g.querySelector("fieldset > legend")?.textContent)).toEqual(FILTER_GROUPS.map(groupName));
    expect(groups.map((g) => g.querySelectorAll("input[type=checkbox]").length)).toEqual(FILTER_GROUPS.map((g) => g.fields.length));
    expect(groups.some((g) => g.open)).toBe(false);
  });
});

describe("POST /plain near a place", () => {
  it("asks the cache for the app's batch by its canonical URL, and shows the first page of it", async () => {
    const { post, asked, stub, limit } = setup();
    const res = await post("/plain", "mode=near&Location=Bristol&Languages=Spanish&Languages=French");
    expect(res.status).toBe(200);
    expect(asked()).toEqual(["/api/search?Location=Bristol&Languages=French&Languages=Spanish"]);
    expect(stub.search).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }), BATCH_SIZE);
    expect(limit).toHaveBeenCalledWith({ key: "203.0.113.9" });
    const { doc } = await read(res);
    expect(doc.title).toBe("30 therapists near Bristol - Find a UKCP therapist (unofficial)");
    expect(doc.querySelector("h1")?.textContent).toBe("30 therapists near Bristol");
    expect(doc.querySelector("main > p")?.textContent).toBe("Showing 1 to 12, nearest first. Change your search");
    const cards = [...doc.querySelectorAll(".results > li")];
    expect(cards.map((li) => li.querySelector("h2")?.textContent)).toEqual(Array.from({ length: 12 }, (_, i) => `Therapist ${i + 1}`));
    expect([...cards[0]!.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["Bristol BS1 (0.1 miles away)", "In-person & Remote", "Summary 1."]);
  });

  it("opens each profile in a new tab by a form posting its slug, and says so", async () => {
    const { doc } = await read(await setup().post("/plain", "Location=Bristol"));
    const form = doc.querySelector<HTMLFormElement>(".results form")!;
    expect([form.getAttribute("method"), form.getAttribute("action"), form.getAttribute("target")]).toEqual(["post", "/plain/therapist", "_blank"]);
    expect(sent(form)).toBe("slug=Therapist-1-ABCDEFGH");
    expect(form.querySelector("button")?.textContent).toBe(`Profile and contact details for Therapist 1 ${NEW_TAB}`);
  });

  it("brings more results a page at a time from the same batch, by a form carrying the search", async () => {
    const { post, asked } = setup();
    let doc = (await read(await post("/plain", "Location=Bristol&KeywordFilter=grief"))).doc;
    const more = () => [...doc.querySelectorAll<HTMLFormElement>("form")].find((f) => f.textContent?.includes("More results"));
    expect(sent(more()!)).toMatch(/^mode=near&Location=Bristol&KeywordFilter=grief&seed=\d+&shown=12$/);
    doc = (await read(await post("/plain", sent(more()!)))).doc;
    expect(doc.querySelector("main > p")?.textContent).toMatch(/^Showing 13 to 24/);
    expect(doc.querySelector(".results h2")?.textContent).toBe("Therapist 13");
    doc = (await read(await post("/plain", sent(more()!)))).doc;
    expect(doc.querySelector("main > p")?.textContent).toMatch(/^Showing 25 to 30/);
    expect(more()).toBeUndefined();
    expect(new Set(asked())).toEqual(new Set(["/api/search?Location=Bristol&KeywordFilter=grief"]));
  });

  it("pages through a batch the same way however UKCP reshuffles it between pages", async () => {
    // Five at each distance, so a page ends among those alike.
    const { post, stub } = setup({ client: { search: reshuffling((n) => Math.ceil(n / 5) / 10) } });
    const pages = await pageThrough(post, "Location=Bristol&seed=7");
    const shown = pages.flat();
    expect([shown.length, new Set(shown).size]).toEqual([30, 30]);
    const tiers = shown.map((name) => Math.ceil(Number(name.replace("Therapist ", "")) / 5));
    expect(tiers).toEqual(tiers.toSorted((a, b) => a - b));
    expect(await pageThrough(post, "Location=Bristol&seed=7")).toEqual(pages);
    expect(stub.search).toHaveBeenCalledTimes(6);
  });

  it("orders a search by the seed its forms carry, another seed giving another order", async () => {
    const { post } = setup({ client: { search: reshuffling(() => 0.5) } });
    const { doc } = await read(await post("/plain", "Location=Bristol&seed=7"));
    expect(doc.querySelector<HTMLInputElement>("#search + form input[name=seed]")?.value).toBe("7");
    const [seven, eight] = [await pageThrough(post, "Location=Bristol&seed=7"), await pageThrough(post, "Location=Bristol&seed=8")];
    expect(seven[0]).toEqual([...doc.querySelectorAll(".results h2")].map((h) => h.textContent));
    expect(new Set(eight.flat())).toEqual(new Set(seven.flat()));
    expect(eight[0]).not.toEqual(seven[0]);
  });

  it("draws a seed for a search sent without one, or with one no seed could be", async () => {
    const { request, post } = setup();
    expect((await read(await request("/plain"))).doc.querySelector("input[name=seed]")).toBeNull();
    for (const seed of ["", "&seed=-1", "&seed=4294967296", "&seed=1.5", "&seed=seven"]) {
      const { doc } = await read(await post("/plain", `Location=Bristol${seed}`));
      const carried = [...doc.querySelectorAll<HTMLInputElement>("input[name=seed]")].map((input) => input.value);
      expect(carried).toHaveLength(2);
      expect(new Set(carried).size).toBe(1);
      expect(readSeed(carried[0])).toBeDefined();
    }
  });

  it("asks for the next batch once a page lies beyond the first", async () => {
    const { post, asked, stub } = setup({ client: { search: vi.fn(async () => bytes(results(12, { total: 600, from: BATCH_SIZE + 1 }))) } });
    const { doc } = await read(await post("/plain", `Location=Bristol&shown=${BATCH_SIZE}`));
    expect(asked()).toEqual(["/api/search?Location=Bristol&page=2"]);
    expect(stub.search).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }), BATCH_SIZE);
    expect(doc.querySelector(".results h2")?.textContent).toBe(`Therapist ${BATCH_SIZE + 1}`);
  });

  it("asks for a place, beside its box, without asking the cache", async () => {
    const { post, forwarded } = setup();
    const res = await post("/plain", "mode=near&Location=++&Languages=French");
    expect(res.status).toBe(200);
    const { doc } = await read(res);
    expect(doc.title).toBe("Error: Plain search - Find a UKCP therapist (unofficial)");
    const box = doc.querySelector("#place")!;
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(doc.getElementById(box.getAttribute("aria-describedby")!.split(" ")[1]!)?.textContent).toBe(`Error: ${NO_PLACE}`);
    expect(doc.querySelector(".problem a[href='#place']")?.textContent).toBe(NO_PLACE);
    // The search stays as it was set, its ticked group open.
    expect(doc.querySelector<HTMLInputElement>("input[name=Languages][value=French]")?.checked).toBe(true);
    expect(doc.querySelector("details[open] summary")?.textContent).toBe("Languages (1 ticked)");
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("says when UKCP didn't recognise the place, rather than listing results from anywhere", async () => {
    const { post } = setup({ client: { search: vi.fn(async () => bytes(results(12, { place: "United Kingdom" }))) } });
    const { doc } = await read(await post("/plain", "Location=Brightn"));
    expect(doc.querySelector("#place-error")?.textContent).toBe(`Error: UKCP didn't recognise "Brightn". Try a town or a postcode.`);
    expect(doc.querySelector(".results")).toBeNull();
  });

  it("asks a visitor to loosen a search that finds no one", async () => {
    const empty = `<div class="fat-search-alert"><h6>No therapists can be found matching your exact query.</h6></div>`;
    const { post } = setup({ client: { search: vi.fn(async () => bytes(empty)) } });
    const { doc } = await read(await post("/plain", "Location=Bristol&Languages=Welsh"));
    expect([doc.querySelector("h1")?.textContent, doc.querySelector("main > p")?.textContent]).toEqual(["No therapists near Bristol", "Remove a filter to see more."]);
  });
});

describe("POST /plain online", () => {
  it("asks what the app's online view asks, with no place, and the whole set by its canonical URL", async () => {
    const { post, asked, stub } = setup();
    const { doc } = await read(await post("/plain", "mode=online&Location=Bristol&Languages=Welsh&OnlyWheelchairAccessible=true"));
    expect(asked()).toEqual(["/api/search?TypesOfSession=Online+Therapy&TypesOfSession=Telephone+Therapy&Languages=Welsh"]);
    expect(stub.search).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }), WHOLE_SET_SIZE);
    expect(doc.querySelector("h1")?.textContent).toBe("30 therapists working online or by phone");
    expect(doc.querySelector("main > p")?.textContent).toBe("Showing 1 to 12. Change your search");
    // How they meet goes unsaid where it is remote, as every therapist here works remotely.
    expect([...doc.querySelectorAll(".results > li:first-child p")].map((p) => p.textContent)).toEqual(["Bristol BS1", "Summary 1."]);
  });

  it("lists the whole set in UKCP's order, reading no further into it than the page shown", async () => {
    // A card no page could read, after those the first page shows.
    const broken = listing(31, { miles: null }).replace('href="therapist/Therapist-31-ABCDEFGH"', 'href="/"');
    const sent = [...Array.from({ length: 30 }, (_, i) => listing(30 - i, { miles: null })), broken].join("\n");
    const { post } = setup({ client: { search: vi.fn(async () => bytes(results(30, { cards: sent, place: "" }))) } });
    const res = await post("/plain", "mode=online&Languages=Welsh&seed=7");
    expect(res.status).toBe(200);
    const { doc } = await read(res);
    expect([...doc.querySelectorAll(".results h2")].map((h) => h.textContent)).toEqual(Array.from({ length: 12 }, (_, i) => `Therapist ${30 - i}`));
    // Its forms carry the seed all the same, for a search changed to near a place.
    expect([...doc.querySelectorAll<HTMLInputElement>("input[name=seed]")].map((input) => input.value)).toEqual(["7", "7"]);
  });

  it("wants a filter besides type of session, said beside the filters, without asking the cache", async () => {
    const { post, forwarded } = setup();
    const { doc } = await read(await post("/plain", "mode=online&TypesOfSession=Online+Therapy"));
    expect(doc.querySelector("#filters + .error")?.textContent).toBe(`Error: ${NEEDS_FILTER}`);
    expect(doc.querySelector("#online")?.getAttribute("aria-describedby")).toBe("online-hint filters-error");
    expect(doc.querySelector<HTMLInputElement>("#online")?.checked).toBe(true);
    expect(forwarded).not.toHaveBeenCalled();
  });
});

describe("POST /plain when something goes wrong", () => {
  it("says the visitor has searched too often, in the Worker's words, without asking UKCP", async () => {
    const { post, stub } = setup({ allow: false });
    const res = await post("/plain", "Location=Bristol");
    expect(res.status).toBe(429);
    expect((await read(res)).doc.querySelector(".problem li")?.textContent).toBe(TOO_MANY);
    expect(stub.search).not.toHaveBeenCalled();
  });

  it("says UKCP isn't responding", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { post } = setup({ client: { search: vi.fn(async () => Promise.reject(new UpstreamError(503, "UKCP answered 503"))) } });
    const res = await post("/plain", "Location=Bristol");
    expect(res.status).toBe(502);
    expect((await read(res)).doc.querySelector(".problem li")?.textContent).toBe(UPSTREAM_DOWN);
  });

  it("says when UKCP's page can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { post } = setup({ client: { search: vi.fn(async () => bytes(`<span class="results-no">Lots of results</span>`)) } });
    const res = await post("/plain", "Location=Bristol");
    expect(res.status).toBe(502);
    expect((await read(res)).doc.querySelector(".problem li")?.textContent).toBe(UNREADABLE);
  });

  it("refuses an option UKCP's form doesn't offer, keeping the rest of the search, without asking the cache", async () => {
    const { post, forwarded } = setup();
    const res = await post("/plain", "Location=Bristol&Languages=Klingon");
    expect(res.status).toBe(400);
    const { doc } = await read(res);
    expect(doc.querySelector(".problem li")?.textContent).toBe(INVALID);
    expect(doc.querySelector<HTMLInputElement>("#place")?.value).toBe("Bristol");
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("refuses a body too big for any search", async () => {
    const { post, forwarded } = setup();
    const res = await post("/plain", `KeywordFilter=${"a".repeat(70_000)}`);
    expect([res.status, res.headers.get("Content-Type")]).toEqual([413, "text/html; charset=UTF-8"]);
    expect(forwarded).not.toHaveBeenCalled();
  });
});

describe("the plain pages' privacy and escaping", () => {
  it("keeps what was searched out of every address a page links or posts to", async () => {
    const { doc } = await read(await setup().post("/plain", "Location=Bristol&KeywordFilter=grief"));
    const addresses = [...doc.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")!).concat([...doc.querySelectorAll("form")].map((f) => f.getAttribute("action")!));
    expect(addresses.filter((address) => /bristol|grief/i.test(address))).toEqual([]);
    expect([...doc.querySelectorAll("form")].every((form) => form.getAttribute("method") === "post")).toBe(true);
  });

  it("shows UKCP's text as text, never as markup", async () => {
    const hostile = listing(1, { name: "&lt;script&gt;alert(1)&lt;/script&gt;", summary: `&quot;&gt;&lt;img src=x onerror=alert(2)&gt;` });
    const { post } = setup({ client: { search: vi.fn(async () => bytes(results(1, { cards: hostile }))) } });
    const { text, doc } = await read(await post("/plain", "Location=Bristol"));
    expect(doc.querySelector(".results h2")?.textContent).toBe("<script>alert(1)</script>");
    expect(doc.querySelector(".results li > p:not(.meta)")?.textContent).toBe(`"><img src=x onerror=alert(2)>`);
    expect([doc.querySelectorAll("script").length, doc.querySelectorAll("img").length]).toEqual([0, 0]);
    expect(text).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("shows what the visitor typed as text", async () => {
    const { doc } = await read(await setup().post("/plain", { Location: `"><script>alert(1)</script>`, mode: "near" }));
    expect(doc.querySelectorAll("script").length).toBe(0);
    expect(doc.querySelector<HTMLInputElement>("#place")?.value).toBe(`"><script>alert(1)</script>`);
  });
});

describe("POST /plain/therapist", () => {
  const profileSetup = (client: Partial<UkcpClient> = {}) =>
    setup({ client: { profile: vi.fn(async () => fixture("profile.html")), contact: vi.fn(async () => fixture("contact.html")), ...client } });

  it("shows the profile with its contact details, asked of the cache as the app's profile asks", async () => {
    const { post, asked } = profileSetup();
    const res = await post("/plain/therapist", "slug=Test-Therapist-1-TESTID01", { "sec-fetch-site": "same-origin" });
    expect([res.status, res.headers.get("Cache-Control")]).toEqual([200, "private, no-cache"]);
    expect(asked()).toEqual(["/api/therapist/Test-Therapist-1-TESTID01", "/api/contact/9239"]);
    const { doc } = await read(res);
    expect([doc.title, doc.querySelector("h1")?.textContent]).toEqual(["Test Therapist 1 - Find a UKCP therapist (unofficial)", "Test Therapist 1"]);
    const links = [...doc.querySelectorAll("main ul:first-of-type a")].map((a) => [a.textContent, a.getAttribute("href"), a.getAttribute("target")]);
    expect(links).toEqual([
      ["01234 567890", "tel:01234567890", null],
      ["therapist@example.com", "mailto:therapist@example.com", null],
      [`example.invalid ${NEW_TAB}`, "https://example.invalid/", "_blank"],
      [`View on UKCP ${NEW_TAB}`, `${UKCP_ORIGIN}/therapist/Test-Therapist-1-TESTID01`, "_blank"],
    ]);
    const headings = [...doc.querySelectorAll("main h2")].map((h) => h.textContent);
    expect(headings).toEqual(expect.arrayContaining(["Contact", "My Approach", "Special Interests", "Types of sessions", "Where they work"]));
    expect(doc.querySelector("main")?.textContent).toContain("£70 per fifty-minute session.");
  });

  it("refuses a request another site's page makes, without asking the cache", async () => {
    const { post, forwarded } = profileSetup();
    for (const site of ["cross-site", "same-site"]) {
      expect((await post("/plain/therapist", "slug=Test-Therapist-1-TESTID01", { "sec-fetch-site": site })).status).toBe(403);
    }
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("refuses an address UKCP couldn't have made, and says when a profile has gone", async () => {
    const { post, forwarded } = profileSetup({ profile: vi.fn(async () => null) });
    expect((await post("/plain/therapist", "slug=../../admin")).status).toBe(400);
    expect(forwarded).not.toHaveBeenCalled();
    const res = await post("/plain/therapist", "slug=Nobody-ZZZZZZZZ");
    expect(res.status).toBe(404);
    expect((await read(res)).doc.querySelector("main p")?.textContent).toBe("This profile isn't on UKCP any more.");
  });

  it("shows the profile when its contact details fail, saying so", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { post } = profileSetup({ contact: vi.fn(async () => Promise.reject(new UpstreamError(503, "UKCP answered 503"))) });
    const res = await post("/plain/therapist", "slug=Test-Therapist-1-TESTID01");
    expect(res.status).toBe(200);
    expect((await read(res)).doc.querySelector("main .error")?.textContent).toBe(UPSTREAM_DOWN);
  });

  it("leads a visit by address alone, or to any other page here, back to the search", async () => {
    const { request } = setup();
    const res = await request("/plain/therapist");
    expect([res.status, res.headers.get("Location"), res.headers.get("Cache-Control")]).toEqual([303, "/plain", "private, no-cache"]);
    const missing = await request("/plain/nothing");
    expect([missing.status, (await read(missing)).doc.querySelector("main a[href='/plain']")?.textContent]).toEqual([404, "Start a new search"]);
  });
});

describe("an address with a trailing slash", () => {
  it("leads a visit under /plain to the address without it, its query left behind, kept by no cache", async () => {
    const { request, forwarded } = setup();
    for (const [path, to] of [
      ["/plain/", "/plain"],
      ["/plain/therapist/", "/plain/therapist"],
      ["/plain//?Location=Bristol", "/plain"],
      ["/plain/Bristol%20BS1/", "/plain/Bristol%20BS1"],
      // Hono routes this here as /plain//evil.example/; the address it leads to stays under /plain.
      ["/pl%61in//evil.example/", "/plain"],
    ] as const) {
      const res = await request(path);
      expect([res.status, res.headers.get("Location"), res.headers.get("Cache-Control")]).toEqual([301, to, "private, no-cache"]);
    }
    expect((await request("/plain/", { method: "HEAD" })).status).toBe(301);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("sends a form under /plain on to the address without it, where it is checked as ever", async () => {
    const { post, forwarded } = setup();
    for (const [path, to] of [["/plain/", "/plain"], ["/plain/therapist/", "/plain/therapist"]] as const) {
      const res = await post(path, "slug=Test-Therapist-1-TESTID01", { "sec-fetch-site": "cross-site" });
      expect([res.status, res.headers.get("Location"), res.headers.get("Cache-Control")]).toEqual([307, to, "private, no-cache"]);
    }
    // A browser sends the form again, with the same body and the same site, to the address it was given.
    expect((await post("/plain/therapist", "slug=Test-Therapist-1-TESTID01", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post("/plain/", `KeywordFilter=${"a".repeat(70_000)}`)).status).toBe(413);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("is left to the routes elsewhere on the Worker", async () => {
    const { request } = setup();
    const res = await request("/api/search/");
    expect([res.status, res.headers.get("Location")]).toEqual([410, null]);
  });
});
