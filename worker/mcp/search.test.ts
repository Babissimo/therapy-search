import { afterEach, describe, expect, it, vi } from "vitest";
import { ALLOWED } from "../../shared/options";
import { EARLY_SIZE, TEXT_MAX_LENGTH, WHOLE_SET_SIZE } from "../../shared/query";
import { fixture } from "../../shared/ukcp/__fixtures__";
import { UPSTREAM_DOWN } from "../app";
import { UNREADABLE } from "../plain/pages";
import { UpstreamError } from "../ukcp/client";
import { HELP_NOW } from "./instructions";
import { bytes, results, setup, SITE } from "./mcp.testing";
import type { ToolResult } from "./protocol";
import { ON_PROFILE } from "./scrub";
import { LAST_PAGE, LISTS, searchDefinition } from "./search";

type Property = { type: string; items?: { enum: string[] }; description?: string; maximum?: number; maxLength?: number };
const schema = () => searchDefinition().inputSchema as { properties: Record<string, Property>; additionalProperties: boolean };

describe("search_therapists's definition", () => {
  it("offers each list's values as UKCP's form does, and no other argument", () => {
    const { properties, additionalProperties } = schema();
    for (const [arg, param] of Object.entries(LISTS)) {
      expect(properties[arg]?.items?.enum).toEqual([...ALLOWED[param]]);
      expect(properties[arg]?.items?.enum.length).toBeGreaterThan(0);
    }
    expect(Object.keys(properties)).toEqual(["location", "issues", "session_types", "works_with", "therapy_types", "languages", "wheelchair_accessible", "page"]);
    expect(additionalProperties).toBe(false);
  });

  it("says which lists narrow the search and which list widens it", () => {
    const { properties } = schema();
    for (const arg of ["issues", "works_with", "therapy_types", "languages"]) expect(properties[arg]?.description).toContain("narrows the list");
    expect(properties.session_types?.description).toContain("any one given");
  });

  it("bounds the place as the site does, and the pages to UKCP's nearest 48", () => {
    const { properties } = schema();
    expect(properties.location?.maxLength).toBe(TEXT_MAX_LENGTH);
    expect(properties.page?.maximum).toBe(LAST_PAGE);
  });

  it("is read-only, and says where to turn for help now", () => {
    const definition = searchDefinition();
    expect(definition.annotations).toEqual({ readOnlyHint: true, openWorldHint: true });
    expect(definition.description).toContain(HELP_NOW);
  });
});

type Found = Record<string, unknown> & { showing?: string; therapists: Record<string, unknown>[] };
const found = (result: ToolResult) => result.structuredContent as Found;
const text = (result: ToolResult) => result.content[0]?.text;

afterEach(() => vi.restoreAllMocks());

describe("search_therapists near a place", () => {
  it("is listed", async () => {
    const { result } = (await (await setup().rpc("tools/list")).json()) as { result: { tools: { name: string }[] } };
    expect(result.tools.map((tool) => tool.name)).toEqual(["search_therapists", "get_therapist"]);
  });

  it("asks the cache for UKCP's nearest 48 by the app's URL, under the assistants' allowance, and gives the first 10", async () => {
    const { call, asked, stub, earlyLimit } = setup();
    const result = await call("search_therapists", { location: "Bristol", issues: ["Bereavement"], languages: ["Polish"] });
    expect(asked()).toEqual(["/api/search/early?Location=Bristol&HelpWithAdvanced=Bereavement&Languages=Polish"]);
    expect(stub.search).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }), EARLY_SIZE);
    expect(earlyLimit).toHaveBeenCalledWith({ key: "mcp" });
    expect(result.isError).toBeUndefined();
    expect(found(result)).toMatchObject({ total: 441, place: "Bristol, City of Bristol, UK", order: "nearest first", showing: "1 to 10", help_now: HELP_NOW });
    expect(found(result).link).toBe(`${SITE}/#/?Location=Bristol&HelpWithAdvanced=Bereavement&Languages=Polish`);
    expect(found(result).therapists).toHaveLength(10);
    expect(found(result).therapists[0]).toEqual({
      id: "Therapist-1-ABCDEFGH",
      name: "Therapist 1",
      place: "Bristol BS1",
      distance: "0.1 miles from Bristol",
      sessions: "Online Therapy",
      summary: "Summary 1.",
      tags: ["Anxiety", "Depression"],
    });
    expect(JSON.parse(text(result)!)).toEqual(found(result));
    expect(text(result)).not.toContain("01234 567890");
  });

  it("gives later pages from the same answer, and stops at its end", async () => {
    const { call, asked } = setup();
    const third = found(await call("search_therapists", { location: "Bristol", page: 3 }));
    expect([third.showing, third.therapists[0]?.id]).toEqual(["21 to 30", "Therapist-21-ABCDEFGH"]);
    const fifth = found(await call("search_therapists", { location: "Bristol", page: 5 }));
    expect([fifth.showing, fifth.therapists.length]).toEqual(["41 to 48", 8]);
    expect(new Set(asked())).toEqual(new Set(["/api/search/early?Location=Bristol"]));
  });

  it("keeps to wheelchair-accessible rooms when asked", async () => {
    const { call, asked } = setup();
    await call("search_therapists", { location: "Leeds", wheelchair_accessible: true });
    expect(asked()).toEqual(["/api/search/early?Location=Leeds&OnlyWheelchairAccessible=true"]);
  });

  it("leaves out a phone number or email a therapist wrote into their summary", async () => {
    const page = results(1).replace("Summary 1.", "Call 07700 900123 or write to jane@example.com.");
    const { call } = setup({ client: { search: vi.fn(async () => bytes(page)) } });
    const result = await call("search_therapists", { location: "Bristol" });
    expect(found(result).therapists[0]?.summary).toBe(`Call ${ON_PROFILE} or write to ${ON_PROFILE}.`);
  });

  it("leaves out contact details written into a therapist's place or a tag", async () => {
    const page = results(1).replace("Bristol BS1", "Bristol 07700 900456").replace("Depression", "jane@example.com");
    const { call } = setup({ client: { search: vi.fn(async () => bytes(page)) } });
    const result = await call("search_therapists", { location: "Bristol" });
    expect(found(result).therapists[0]).toMatchObject({ place: `Bristol ${ON_PROFILE}`, tags: ["Anxiety", ON_PROFILE] });
    expect(text(result)).not.toMatch(/07700|jane@/);
  });

  it("says when UKCP didn't recognise the place, rather than give results from anywhere", async () => {
    const { call } = setup({ client: { search: vi.fn(async () => bytes(results(48, { total: 8000, place: "United Kingdom" }))) } });
    const result = await call("search_therapists", { location: "Brightn" });
    expect([result.isError, text(result)]).toEqual([true, 'UKCP didn\'t recognise "Brightn". Try a town or a postcode.']);
  });

  it("gives none, and no range, when UKCP finds no one", async () => {
    const { call } = setup({ client: { search: vi.fn(async () => bytes(fixture("results-empty.html"))) } });
    const none = found(await call("search_therapists", { location: "Brighton", therapy_types: ["Adolescent Counsellor"] }));
    expect(none).toMatchObject({ total: 0, therapists: [] });
    expect(none).not.toHaveProperty("showing");
  });
});

describe("search_therapists online", () => {
  it("asks for everyone working online or by phone who matches, in UKCP's shuffle, and links to the site's online view", async () => {
    const { call, asked, stub, limit } = setup();
    const online = found(await call("search_therapists", { issues: ["Anxiety"] }));
    expect(asked()).toEqual(["/api/search?TypesOfSession=Online+Therapy&TypesOfSession=Telephone+Therapy&HelpWithAdvanced=Anxiety"]);
    expect(stub.search).toHaveBeenCalledWith(expect.anything(), WHOLE_SET_SIZE);
    expect(limit).toHaveBeenCalledWith({ key: "mcp" });
    expect(online).toMatchObject({ total: 441, order: "random", link: `${SITE}/#/online?HelpWithAdvanced=Anxiety` });
    expect(online).not.toHaveProperty("place");
  });

  it("keeps to the session types that can be had remotely", async () => {
    const { call, asked } = setup();
    await call("search_therapists", { session_types: ["Telephone Therapy", "Home Visits"], languages: ["Welsh"] });
    expect(asked()).toEqual(["/api/search?TypesOfSession=Telephone+Therapy&Languages=Welsh"]);
  });

  it("needs a filter besides the session types, and asks nothing without one", async () => {
    const { call, forwarded } = setup();
    const result = await call("search_therapists", { session_types: ["Online Therapy"] });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/^To search online, give a filter besides session_types/);
    expect(forwarded).not.toHaveBeenCalled();
  });
});

describe("search_therapists's arguments", () => {
  it("reads an optional argument sent as null as left out", async () => {
    const { call, asked } = setup();
    const result = await call("search_therapists", { location: "Bristol", issues: null, languages: null, wheelchair_accessible: null, page: null });
    expect(result.isError).toBeUndefined();
    expect(asked()).toEqual(["/api/search/early?Location=Bristol"]);
  });

  it("still refuses an argument it doesn't take when that is null", async () => {
    const result = await setup().call("search_therapists", { location: "Bristol", keyword: null });
    expect([result.isError, text(result)]).toEqual([true, 'search_therapists takes no argument "keyword".']);
  });

  it.each([
    [{ location: "Bristol", languages: ["Klingon"] }, 'languages has no option "Klingon".'],
    [{ location: "Bristol", issues: "Anxiety" }, "issues must be a list of UKCP's values."],
    [{ location: 42 }, "location must be text."],
    [{ location: "x".repeat(201) }, "location is longer than 200 characters."],
    [{ location: "Bristol", wheelchair_accessible: "yes" }, "wheelchair_accessible must be true or false."],
    [{ location: "Bristol", page: 6 }, "page must be a whole number from 1 to 5."],
    [{ location: "Bristol", keyword: "grief" }, 'search_therapists takes no argument "keyword".'],
    [{ location: "Bristol", toString: "x" }, 'search_therapists takes no argument "toString".'],
  ])("refuses %o without asking UKCP", async (args, said) => {
    const { call, forwarded } = setup();
    const result = await call("search_therapists", args);
    expect([result.isError, text(result)]).toEqual([true, said]);
    expect(forwarded).not.toHaveBeenCalled();
  });
});

describe("search_therapists when the search fails", () => {
  it("says assistants have searched too much, and offers the site, whose visitors each have their own allowance", async () => {
    const result = await setup({ allowEarly: false }).call("search_therapists", { location: "Bristol" });
    expect([result.isError, text(result)]).toEqual([
      true,
      `Assistants have made too many searches in the last minute. Wait a minute and try again, or open the search on the site: ${SITE}/#/?Location=Bristol`,
    ]);
  });

  it("says UKCP isn't responding, in the app's words, with the site's link", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { call } = setup({
      client: {
        search: vi.fn(async () => {
          throw new UpstreamError(503, "UKCP answered 503");
        }),
      },
    });
    const result = await call("search_therapists", { location: "Bristol" });
    expect(text(result)).toBe(`${UPSTREAM_DOWN} The same search on the site: ${SITE}/#/?Location=Bristol`);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("Bristol");
  });

  it("says when UKCP's page can't be read", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { call } = setup({ client: { search: vi.fn(async () => bytes('<span class="results-no">no range here</span>')) } });
    const result = await call("search_therapists", { location: "Bristol" });
    expect(text(result)).toBe(`${UNREADABLE} The same search on the site: ${SITE}/#/?Location=Bristol`);
    expect(JSON.stringify(logged.mock.calls)).not.toContain("Bristol");
  });
});
