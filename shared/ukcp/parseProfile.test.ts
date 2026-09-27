// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fixture } from "./__fixtures__";
import { parseProfile } from "./parseProfile";
import { ParseError } from "./text";

describe("parseProfile on a captured page", () => {
  const p = parseProfile(fixture("profile.html"), "Test-Therapist-1-TESTID01");

  it("reads the header", () => {
    expect(p).toMatchObject({ slug: "Test-Therapist-1-TESTID01", name: "Test Therapist 1", location: "Testtown", email: "therapist@example.com" });
    expect(p.contactId).toMatch(/^\d+$/);
  });

  it("reads each about section's heading with its text, list or expandable details", () => {
    expect(p.about.length).toBeGreaterThan(0);
    expect(p.about.every((s) => s.heading !== "")).toBe(true);
    const withText = p.about.find((s) => s.paragraphs.length > 0);
    expect(withText?.paragraphs).toEqual(["First paragraph.", "Second paragraph."]);
    expect(p.about.some((s) => s.items.length > 0)).toBe(true);
  });

  it("reads offices with their address lines, map link and cost", () => {
    expect(p.offices.length).toBeGreaterThan(0);
    for (const office of p.offices) {
      expect(office.name).not.toBe("");
      expect(office.address).toEqual(["1 Test Street", "Testtown AB1 2CD"]);
      expect(office.mapUrl).toBe("https://maps.example.invalid/");
    }
    expect(p.offices.filter((o) => o.isMain)).toHaveLength(1);
  });

  it("reads the practical sections, such as types of sessions", () => {
    expect(p.practical.map((s) => s.heading)).toContain("Types of sessions");
  });
});

describe("parseProfile details", () => {
  const header = `<div class="therapist-header"><h1>Jo Bloggs</h1></div>`;
  const page = (contacts: string) =>
    `${header}<div class="therapist-contacts">${contacts}</div><div class="profile-bio"><section><h2>Special Interests</h2><p>Intro.</p>
<div class="accordion-item"><button class="accordion-header">Anxiety</button><div class="accordion-body"><span>Line one.&#xA;Line two.</span></div></div></section></div>`;

  it("keeps the line breaks inside expandable details", () => {
    const [section] = parseProfile(page(""), "Jo-Bloggs-ABCDEFGH").about;
    expect(section?.details).toEqual([{ title: "Anxiety", text: "Line one.\nLine two." }]);
  });

  it("offers no contact reveal when UKCP marks the profile as having none", () => {
    const p = parseProfile(page(`<div class="therapist-contacts-details" data-id="1" data-nodata="true"></div>`), "Jo-Bloggs-ABCDEFGH");
    expect(p.contactId).toBeUndefined();
  });

  it("reads the address from a mailto link with a subject or a stray percent sign", () => {
    const email = (href: string) => parseProfile(page(`<a href="${href}">Email</a>`), "Jo-Bloggs-ABCDEFGH").email;
    expect(email("mailto:jo%40example.com?subject=Enquiry")).toBe("jo@example.com");
    expect(email("mailto:jo%zz@example.com")).toBe("jo%zz@example.com");
  });

  it("ignores the share link's empty mailto", () => {
    const p = parseProfile(page(`<a href="mailto:?subject=Jo">Share</a>`), "Jo-Bloggs-ABCDEFGH");
    expect(p.email).toBeUndefined();
  });

  it("shows a profile with no biography, leaving out headings with nothing under them", () => {
    const p = parseProfile(`${header}<div class="profile-bio"><section><h2>About Me</h2></section></div>`, "Jo-Bloggs-ABCDEFGH");
    expect([p.name, p.about]).toEqual(["Jo Bloggs", []]);
    expect(parseProfile(header, "Jo-Bloggs-ABCDEFGH").about).toEqual([]);
  });

  it("reads text that isn't in a paragraph, and leaves out empty side sections", () => {
    const side = `<div class="profile-practical-information"><section><h2>Working with Children</h2><span>For more, <a href="/x">visit our page</a>.</span></section><section><h3>Types of sessions</h3></section></div>`;
    expect(parseProfile(header + side, "Jo-Bloggs-ABCDEFGH").practical).toEqual([
      { heading: "Working with Children", paragraphs: ["For more, visit our page."], items: [], details: [] },
    ]);
  });

  it("offers no map for an office without an address", () => {
    const office = `<div class="profile-locations"><section><h3>Office</h3><address><strong><br></strong></address><a class="mini-cta" href="https://maps.google.co.uk/?q=%2c+%2c+">View Map</a></section></div>`;
    expect(parseProfile(header + office, "Jo-Bloggs-ABCDEFGH").offices).toEqual([{ name: "Office", isMain: false, address: [], mapUrl: undefined, cost: undefined }]);
  });

  it("fails loudly on a page that isn't a profile", () => {
    expect(() => parseProfile("<h1>Find a therapist</h1><p>Home page</p>", "x")).toThrow(ParseError);
  });
});
