import { describe, expect, it, vi } from "vitest";
import { emptyParams } from "../../shared/query";
import { UkcpClient, UpstreamError, searchForm, type Fetch, type SessionStore } from "./client";

const SEARCH_PAGE = `<form id="FindATherapistSearch"><input name="__RequestVerificationToken" type="hidden" value="TOKEN-1" /></form>`;

function pageResponse(token = "TOKEN-1") {
  return new Response(SEARCH_PAGE.replace("TOKEN-1", token), {
    headers: [
      ["Set-Cookie", ".AspNetCore.Antiforgery.x=af; path=/; samesite=strict; httponly"],
      ["Set-Cookie", "ARRAffinity=aff; Path=/; HttpOnly"],
    ],
  });
}

/** A KV namespace in memory, with the options each value was written with. */
function memoryStore(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  const puts: { key: string; value: string; options: { expirationTtl: number } }[] = [];
  const store: SessionStore = {
    get: async (key) => values.get(key) ?? null,
    put: async (key, value, options) => {
      puts.push({ key, value, options });
      values.set(key, value);
    },
  };
  return { store, puts };
}

const shared = (token: string, fetchedAt: number) => JSON.stringify({ cookie: "ARRAffinity=shared", token, fetchedAt });

/** A stub upstream that answers, or fails, in order and records every call. */
function upstream(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: Fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
    if (next instanceof Error) throw next;
    return next;
  });
  return { fetch, calls };
}

describe("UkcpClient.search", () => {
  it("fetches a session first, then posts the form with its cookies and token", async () => {
    const { fetch, calls } = upstream(pageResponse(), new Response("<div>results</div>"));
    const client = new UkcpClient(fetch, "test-agent");

    const html = await client.search({ ...emptyParams(), text: { HelpWith: "", Location: "Leeds", KeywordFilter: "" } });

    expect(html).toBe("<div>results</div>");
    expect(calls.map((c) => c.url)).toEqual([
      "https://www.psychotherapy.org.uk/find-a-therapist/",
      "https://www.psychotherapy.org.uk/umbraco/surface/searchsurface/Search",
    ]);
    const post = calls[1]!.init;
    const headers = new Headers(post.headers);
    expect(headers.get("Cookie")).toBe(".AspNetCore.Antiforgery.x=af; ARRAffinity=aff");
    expect(headers.get("User-Agent")).toBe("test-agent");
    const body = post.body as URLSearchParams;
    expect(body.get("__RequestVerificationToken")).toBe("TOKEN-1");
    expect(body.get("Location")).toBe("Leeds");
  });

  it("reuses the session for 20 minutes, then renews it", async () => {
    let now = 0;
    const { fetch, calls } = upstream(pageResponse(), new Response("a"), new Response("b"), pageResponse("TOKEN-2"), new Response("c"));
    const client = new UkcpClient(fetch, "ua", { now: () => now });

    await client.search(emptyParams());
    now = 19 * 60 * 1000;
    await client.search(emptyParams());
    now = 21 * 60 * 1000;
    await client.search(emptyParams());

    expect(calls.filter((c) => c.url.endsWith("/find-a-therapist/"))).toHaveLength(2);
    expect((calls[4]!.init.body as URLSearchParams).get("__RequestVerificationToken")).toBe("TOKEN-2");
  });

  it("renews the session and retries once when UKCP rejects the token", async () => {
    const { fetch, calls } = upstream(pageResponse(), new Response("", { status: 400 }), pageResponse("TOKEN-2"), new Response("ok"));
    const client = new UkcpClient(fetch, "ua");

    await expect(client.search(emptyParams())).resolves.toBe("ok");
    expect((calls[3]!.init.body as URLSearchParams).get("__RequestVerificationToken")).toBe("TOKEN-2");
  });

  it("gives up after one retry", async () => {
    const { fetch } = upstream(pageResponse(), new Response("", { status: 400 }), pageResponse(), new Response("", { status: 400 }));
    await expect(new UkcpClient(fetch, "ua").search(emptyParams())).rejects.toEqual(new UpstreamError(400, "UKCP answered 400"));
  });

  it("does not retry other failures", async () => {
    const { fetch, calls } = upstream(pageResponse(), new Response("", { status: 503 }));
    await expect(new UkcpClient(fetch, "ua").search(emptyParams())).rejects.toBeInstanceOf(UpstreamError);
    expect(calls).toHaveLength(2);
  });
});

describe("UkcpClient's shared session", () => {
  it("takes a session another isolate stored, without fetching the search page", async () => {
    const { fetch, calls } = upstream(new Response("results"));
    const { store } = memoryStore({ session: shared("SHARED", 0) });
    await new UkcpClient(fetch, "ua", { store, now: () => 5 * 60 * 1000 }).search(emptyParams());

    expect(calls.map((c) => c.url)).toEqual(["https://www.psychotherapy.org.uk/umbraco/surface/searchsurface/Search"]);
    expect(new Headers(calls[0]!.init.headers).get("Cookie")).toBe("ARRAffinity=shared");
    expect((calls[0]!.init.body as URLSearchParams).get("__RequestVerificationToken")).toBe("SHARED");
  });

  it("stores a session it fetches, to expire with it", async () => {
    const { fetch } = upstream(pageResponse(), new Response("results"));
    const { store, puts } = memoryStore();
    await new UkcpClient(fetch, "ua", { store, now: () => 1000 }).search(emptyParams());

    expect(puts).toEqual([
      { key: "session", value: JSON.stringify({ cookie: ".AspNetCore.Antiforgery.x=af; ARRAffinity=aff", token: "TOKEN-1", fetchedAt: 1000 }), options: { expirationTtl: 1200 } },
    ]);
  });

  it("reads the store only when its own session is missing or stale", async () => {
    let now = 0;
    const { fetch } = upstream(pageResponse(), new Response("a"), new Response("b"));
    const { store } = memoryStore();
    const get = vi.spyOn(store, "get");
    const client = new UkcpClient(fetch, "ua", { store, now: () => now });

    await client.search(emptyParams());
    now = 19 * 60 * 1000;
    await client.search(emptyParams());

    expect(get).toHaveBeenCalledOnce();
  });

  it("fetches a new session when the stored one is 20 minutes old", async () => {
    const { fetch, calls } = upstream(pageResponse("TOKEN-2"), new Response("results"));
    const { store, puts } = memoryStore({ session: shared("OLD", 0) });
    await new UkcpClient(fetch, "ua", { store, now: () => 20 * 60 * 1000 }).search(emptyParams());

    expect((calls[1]!.init.body as URLSearchParams).get("__RequestVerificationToken")).toBe("TOKEN-2");
    expect(JSON.parse(puts[0]!.value)).toMatchObject({ token: "TOKEN-2" });
  });

  it("replaces a stored session UKCP rejects", async () => {
    const { fetch, calls } = upstream(new Response("", { status: 400 }), pageResponse("TOKEN-2"), new Response("ok"));
    const { store, puts } = memoryStore({ session: shared("REJECTED", 0) });
    await expect(new UkcpClient(fetch, "ua", { store, now: () => 0 }).search(emptyParams())).resolves.toBe("ok");

    expect((calls[2]!.init.body as URLSearchParams).get("__RequestVerificationToken")).toBe("TOKEN-2");
    expect(JSON.parse(puts[0]!.value)).toMatchObject({ token: "TOKEN-2" });
  });

  it("takes a newer stored session when its own is stale, keeping the time it was fetched", async () => {
    let now = 0;
    const { fetch, calls } = upstream(pageResponse(), new Response("a"), new Response("b"), pageResponse("TOKEN-3"), new Response("c"));
    const { store } = memoryStore();
    const client = new UkcpClient(fetch, "ua", { store, now: () => now });

    await client.search(emptyParams());
    await store.put("session", shared("NEWER", 15 * 60 * 1000), { expirationTtl: 1200 });
    now = 21 * 60 * 1000;
    await client.search(emptyParams());
    now = 36 * 60 * 1000;
    await client.search(emptyParams());

    expect(calls.map((c) => (c.init.body as URLSearchParams | undefined)?.get("__RequestVerificationToken") ?? "page")).toEqual([
      "page",
      "TOKEN-1",
      "NEWER",
      "page",
      "TOKEN-3",
    ]);
  });

  it("leaves a session whose server fails for a new one", async () => {
    const { fetch, calls } = upstream(new Response("", { status: 503 }), pageResponse("TOKEN-2"), new Response("results"));
    const { store, puts } = memoryStore({ session: shared("PINNED", 0) });
    const client = new UkcpClient(fetch, "ua", { store, now: () => 2 * 60 * 1000 });

    await expect(client.search(emptyParams())).rejects.toBeInstanceOf(UpstreamError);
    await expect(client.search(emptyParams())).resolves.toBe("results");

    expect((calls[2]!.init.body as URLSearchParams).get("__RequestVerificationToken")).toBe("TOKEN-2");
    expect(JSON.parse(puts[0]!.value)).toMatchObject({ token: "TOKEN-2" });
  });

  it("leaves a session behind when its server times out", async () => {
    const { fetch, calls } = upstream(new DOMException("timed out", "TimeoutError"), pageResponse("TOKEN-2"), new Response("results"));
    const { store } = memoryStore({ session: shared("PINNED", 0) });
    const client = new UkcpClient(fetch, "ua", { store, now: () => 2 * 60 * 1000 });

    await expect(client.search(emptyParams())).rejects.toMatchObject({ name: "TimeoutError" });
    await client.search(emptyParams());

    expect(calls[1]!.url).toBe("https://www.psychotherapy.org.uk/find-a-therapist/");
  });

  it("keeps a session fetched within the minute through a failure, which more likely lies with the request", async () => {
    const { fetch, calls } = upstream(pageResponse(), new Response("", { status: 500 }), new Response("results"));
    const client = new UkcpClient(fetch, "ua", { store: memoryStore().store, now: () => 30 * 1000 });

    await expect(client.search(emptyParams())).rejects.toBeInstanceOf(UpstreamError);
    await expect(client.search(emptyParams())).resolves.toBe("results");

    expect(calls.filter((c) => c.url.endsWith("/find-a-therapist/"))).toHaveLength(1);
  });

  it("passes on a failed session fetch as UKCP's failure", async () => {
    const { fetch } = upstream(new Response("", { status: 503 }));
    await expect(new UkcpClient(fetch, "ua").search(emptyParams())).rejects.toEqual(new UpstreamError(503, "UKCP answered 503"));
  });

  it("searches with a session of its own when the store fails", async () => {
    const { fetch } = upstream(pageResponse(), new Response("results"));
    const store: SessionStore = { get: () => Promise.reject(new Error("KV down")), put: () => Promise.reject(new Error("429")) };
    await expect(new UkcpClient(fetch, "ua", { store }).search(emptyParams())).resolves.toBe("results");
  });

  it("ignores a stored value it can't read", async () => {
    const { fetch, calls } = upstream(pageResponse(), new Response("results"));
    const { store } = memoryStore({ session: "not json" });
    await new UkcpClient(fetch, "ua", { store }).search(emptyParams());
    expect(calls).toHaveLength(2);
  });
});

describe("UkcpClient.profile", () => {
  it("returns the page, without a session", async () => {
    const { fetch, calls } = upstream(new Response("<h1>Name</h1>"));
    await expect(new UkcpClient(fetch, "ua").profile("Jo-Bloggs-ABCDEFGH")).resolves.toBe("<h1>Name</h1>");
    expect(calls[0]!.url).toBe("https://www.psychotherapy.org.uk/therapist/Jo-Bloggs-ABCDEFGH");
    expect(calls[0]!.init.redirect).toBe("manual");
  });

  it("returns null when UKCP redirects an unknown slug home", async () => {
    const { fetch } = upstream(new Response(null, { status: 302, headers: { Location: "https://www.psychotherapy.org.uk/" } }));
    await expect(new UkcpClient(fetch, "ua").profile("Nobody-ZZZZZZZZ")).resolves.toBeNull();
  });
});

describe("UkcpClient.contact", () => {
  it("posts the id with the session token", async () => {
    const { fetch, calls } = upstream(pageResponse(), new Response("<div>details</div>"));
    await new UkcpClient(fetch, "ua").contact("9239");
    const body = calls[1]!.init.body as URLSearchParams;
    expect(calls[1]!.url).toBe("https://www.psychotherapy.org.uk/Umbraco/Surface/ProfileSurface/ContactDetails");
    expect([body.get("id"), body.get("__RequestVerificationToken")]).toEqual(["9239", "TOKEN-1"]);
  });
});

describe("searchForm", () => {
  it("sends every field UKCP's form sends, with repeated keys for multiple values", () => {
    const params = emptyParams();
    params.multi.Languages = ["French", "Spanish"];
    params.flags.OnlyWheelchairAccessible = true;
    params.page = 3;
    params.orderSeed = 7;

    const form = searchForm(params);

    expect(form.getAll("Languages")).toEqual(["French", "Spanish"]);
    expect(form.get("OnlyWheelchairAccessible")).toBe("true");
    expect(form.get("OnlyProfilesWithPhotos")).toBe("false");
    expect(form.get("Distance")).toBe("30");
    expect(form.get("Pager.CurrentPage")).toBe("3");
    expect(form.get("Pager.PageSize")).toBe("480");
    expect(form.get("OrderSeed")).toBe("7");
  });

  it("asks for a smaller page when told to", () => {
    expect(searchForm(emptyParams(), 12).get("Pager.PageSize")).toBe("12");
  });
});
