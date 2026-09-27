import { describe, expect, it, vi } from "vitest";
import { emptyParams } from "../../shared/query";
import { UkcpClient, UpstreamError, searchForm, type Fetch } from "./client";

const SEARCH_PAGE = `<form id="FindATherapistSearch"><input name="__RequestVerificationToken" type="hidden" value="TOKEN-1" /></form>`;

function pageResponse(token = "TOKEN-1") {
  return new Response(SEARCH_PAGE.replace("TOKEN-1", token), {
    headers: [
      ["Set-Cookie", ".AspNetCore.Antiforgery.x=af; path=/; samesite=strict; httponly"],
      ["Set-Cookie", "ARRAffinity=aff; Path=/; HttpOnly"],
    ],
  });
}

/** A stub upstream that answers in order and records every call. */
function upstream(...responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: Fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected request to ${url}`);
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
    const client = new UkcpClient(fetch, "ua", () => now);

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
    expect(form.get("Distance")).toBe("10");
    expect(form.get("Pager.CurrentPage")).toBe("3");
    expect(form.get("Pager.PageSize")).toBe("12");
    expect(form.get("OrderSeed")).toBe("7");
  });
});
