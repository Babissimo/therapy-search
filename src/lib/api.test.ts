// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, UNREADABLE } from "./api";

const answer = (body: string, status = 200) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));

afterEach(() => vi.unstubAllGlobals());

describe("api", () => {
  it("reads UKCP's HTML in the browser", async () => {
    answer(`<span class="results-no">1-1 of 1 results</span><div class="profile-listing"><a href="therapist/Jo-Bloggs-ABCDEFGH"><h2>Jo Bloggs</h2></a></div>`);
    await expect(api.search("Location=Leeds")).resolves.toMatchObject({ total: 1, therapists: [{ slug: "Jo-Bloggs-ABCDEFGH", name: "Jo Bloggs" }] });
    expect(fetch).toHaveBeenCalledWith("/api/search?Location=Leeds", undefined);
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
    expect(fetch).toHaveBeenCalledWith("/api/place?q=BRIGHTON+BN3&centre=true");
  });

  it("passes on the Worker's error for a place lookup", async () => {
    answer(JSON.stringify({ error: "Couldn't look up that place just now." }), 502);
    await expect(api.place("BN3")).rejects.toMatchObject({ status: 502, message: "Couldn't look up that place just now." });
  });
});
