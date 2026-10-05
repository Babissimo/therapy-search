import { afterEach, describe, expect, it, vi } from "vitest";
import { fixture } from "../../shared/ukcp/__fixtures__";
import { UNREADABLE } from "../plain/pages";
import { readProfile } from "../ukcp/profile";
import { setup, SITE } from "./mcp.testing";
import type { ToolResult } from "./protocol";
import { ON_PROFILE, scrub } from "./scrub";

const ID = "Test-Therapist-1-TESTID01";
// The fixture, with contact details written into each kind of text a therapist fills in: their biography, a list in the practical
// information, an accordion's title and text, the place, and an office's name, address and fee.
const PLANTED = [
  "07700 900123",
  "jane@example.com",
  "07700 900456",
  "ask@example.org",
  "+44 20 7946 0018",
  "020 7946 0111",
  "07700 900789",
  "0117 496 0123",
  "fees@example.org",
];
const PLANTS: [string | RegExp, string][] = [
  ["First paragraph.", "First paragraph. Call me on 07700 900123 or write to jane@example.com."],
  ["<li>Online Therapy</li>", "<li>Online Therapy, or ring 07700 900456</li>"],
  [/(SpecialInterests_Head0">\s*Anxiety)/, "$1 (ask@example.org)"],
  ["<span>Detail line one.&#xA;Detail line two.</span>", "<span>Detail line one.&#xA;Detail line two, or +44 20 7946 0018.</span>"],
  ['profile-intro-locations">Testtown<', 'profile-intro-locations">Testtown 020 7946 0111<'],
  ["Brighton Office", "Brighton Office 07700 900789"],
  ["Testtown AB1 2CD</address>", "Testtown AB1 2CD<br>Tel 0117 496 0123</address>"],
  ["per fifty-minute session.", "per fifty-minute session. Write to fees@example.org."],
];
const PAGE = PLANTS.reduce((page, [from, to]) => {
  if (typeof from === "string" ? !page.includes(from) : !from.test(page)) throw new Error(`the fixture has no ${from}`);
  return page.replace(from, to);
}, fixture("profile.html"));
const PROFILE = readProfile(PAGE);

type Section = { heading: string };
type Profile = Record<string, unknown> & { about: Section[]; practical: Section[]; offices: unknown[]; links: Record<string, string> };
const profileOf = (result: ToolResult) => result.structuredContent as Profile;
const text = (result: ToolResult) => result.content[0]?.text ?? "";
const withProfile = () => setup({ client: { profile: vi.fn(async () => PAGE) } });

afterEach(() => vi.restoreAllMocks());

describe("get_therapist", () => {
  it("is listed after the search, which names it", async () => {
    const { result } = (await (await setup().rpc("tools/list")).json()) as { result: { tools: { name: string; description: string }[] } };
    expect(result.tools.map((tool) => tool.name)).toEqual(["search_therapists", "get_therapist"]);
    expect(result.tools[0]?.description).toContain("get_therapist");
  });

  it("asks the cache for the profile under the assistants' allowance", async () => {
    const { call, asked, limit } = withProfile();
    await call("get_therapist", { id: ID });
    expect(asked()).toEqual([`/api/therapist/${ID}`]);
    expect(limit).toHaveBeenCalledWith({ key: "mcp" });
  });

  it("gives the profile as UKCP's page has it, with links to it here and on UKCP", async () => {
    const result = await withProfile().call("get_therapist", { id: ID });
    const profile = profileOf(result);
    expect(profile).toMatchObject({ name: PROFILE.name, languages: PROFILE.languages });
    expect(profile.about.map((section) => section.heading)).toEqual(PROFILE.about.map((section) => section.heading));
    expect(profile.practical.map((section) => section.heading)).toEqual(PROFILE.practical.map((section) => section.heading));
    expect(profile.offices).toEqual(
      PROFILE.offices.map((office) => ({
        name: scrub(office.name),
        main: office.isMain,
        address: office.address.map(scrub),
        ...(office.cost && { fees: scrub(office.cost) }),
      })),
    );
    expect(profile.links).toEqual({ site: `${SITE}/#/therapist/${ID}`, ukcp: `https://www.psychotherapy.org.uk/therapist/${ID}` });
    expect(JSON.parse(text(result))).toEqual(profile);
  });

  it("gives no contact details, not even those written into the text", async () => {
    const result = await withProfile().call("get_therapist", { id: ID });
    expect(PROFILE.email).toBeDefined();
    expect(PROFILE.contactId).toBeDefined();
    expect(text(result)).not.toContain(PROFILE.email);
    expect(text(result)).not.toContain(PROFILE.contactId);
    // Each is in a field the profile reads, so its absence below is the tool's doing.
    for (const planted of PLANTED) expect(JSON.stringify(PROFILE), planted).toContain(planted);
    for (const planted of PLANTED) expect(text(result), planted).not.toContain(planted);
    expect(text(result)).toContain(ON_PROFILE);
    expect(Object.keys(profileOf(result))).not.toEqual(expect.arrayContaining(["email"]));
    expect(Object.keys(profileOf(result))).not.toEqual(expect.arrayContaining(["contactId"]));
  });

  it.each([[{ id: "../etc/passwd" }], [{ id: "" }], [{ id: 42 }], [{}]])("refuses %o without asking UKCP", async (args) => {
    const { call, forwarded } = withProfile();
    const result = await call("get_therapist", args);
    expect(result.isError).toBe(true);
    expect(forwarded).not.toHaveBeenCalled();
  });

  it("refuses an argument it doesn't take", async () => {
    const result = await withProfile().call("get_therapist", { id: ID, contact: true });
    expect([result.isError, text(result)]).toEqual([true, 'get_therapist takes no argument "contact".']);
  });

  it("says when UKCP no longer has the profile", async () => {
    const result = await setup().call("get_therapist", { id: ID });
    expect([result.isError, text(result)]).toEqual([true, "This profile isn't on UKCP any more."]);
  });

  it("says when UKCP's page can't be read, without logging whose profile it was", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { call } = setup({ client: { profile: vi.fn(async () => '<div class="therapist-header"></div>') } });
    const result = await call("get_therapist", { id: ID });
    expect([result.isError, text(result)]).toEqual([true, `${UNREADABLE} The profile on the site: ${SITE}/#/therapist/${ID}`]);
    expect(logged).toHaveBeenCalled();
    expect(JSON.stringify(logged.mock.calls)).not.toContain(ID);
  });

  it("says assistants have asked too much, and offers the profile on the site", async () => {
    const result = await setup({ allow: false }).call("get_therapist", { id: ID });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(new RegExp(`too many profiles.*${SITE}/#/therapist/${ID}$`));
  });
});
