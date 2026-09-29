// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fixture } from "./__fixtures__";
import { parseResults } from "./parseResults";
import { ParseError } from "./text";

const SLUG = /^Test-Therapist-\d+-TESTID\d+$/;

describe("parseResults on captured pages", () => {
  it("reads a location search: range, resolved place, notices and 12 cards", () => {
    const r = parseResults(fixture("results-location.html"));
    expect(r.total).toBeGreaterThan(12);
    expect([r.from, r.to]).toEqual([1, 12]);
    expect(r.locationSearched).toMatch(/Brighton/);
    expect(r.notices.length).toBeGreaterThan(0);
    expect(r.therapists).toHaveLength(12);
    for (const t of r.therapists) {
      expect(t.slug).toMatch(SLUG);
      expect(t.name).toMatch(/^Test Therapist \d+$/);
    }
    // Remote-only therapists can appear without an address, and so without a distance.
    expect(r.therapists.some((t) => /miles? from Brighton/.test(t.distance ?? ""))).toBe(true);
  });

  it("reads a search without a location, which has no resolved place", () => {
    const r = parseResults(fixture("results-no-location.html"));
    expect(r.locationSearched).toBeUndefined();
    expect(r.therapists).toHaveLength(12);
    expect(r.therapists.every((t) => t.distance === undefined)).toBe(true);
  });

  it("shows when UKCP fell back to the whole country", () => {
    expect(parseResults(fixture("results-unknown-location.html")).locationSearched).toBe("United Kingdom");
  });

  it("reads a search with no matches as zero results with UKCP's notice", () => {
    const r = parseResults(fixture("results-empty.html"));
    expect([r.total, r.therapists.length]).toEqual([0, 0]);
    expect(r.notices[0]).toMatch(/No therapists can be found/);
  });
});

describe("parseResults card details", () => {
  const card = (inner: string) =>
    `<span class="results-no">1-1 of 1 results</span><div class="profile-listing"><a href="therapist/Jo-Bloggs-ABCDEFGH" class="light-anchor">${inner}</a></div>`;

  it("leaves the phone out of the session type and tidies non-breaking spaces", () => {
    const [t] = parseResults(
      card(`<h2>Jo Bloggs</h2><span class="profile-listing-contact-session-type"><strong>0121 504 3691</strong>
|&nbsp;In-person&nbsp;&amp;&nbsp;Remote </span>`),
    ).therapists;
    expect(t?.sessionTypes).toBe("In-person & Remote");
    expect(JSON.stringify(t)).not.toContain("0121");
  });

  it("uses UKCP's initials when there is no photo, and leaves blanks undefined", () => {
    const [t] = parseResults(
      card(`<div class="profile-photo profile-photo-placeholder"><span>JB</span></div><h2>Jo Bloggs</h2>
<span class="profile-listing-locations"><strong> </strong></span><span class="profile-listing-contact-session-type">Remote</span>`),
    ).therapists;
    expect(t).toEqual({ slug: "Jo-Bloggs-ABCDEFGH", name: "Jo Bloggs", initials: "JB", sessionTypes: "Remote", tags: [] });
  });

  it("drops a photo whose address is not http(s)", () => {
    const [t] = parseResults(card(`<img class="profile-photo" src="javascript:alert(1)"><h2>Jo Bloggs</h2>`)).therapists;
    expect(t?.photoUrl).toBeUndefined();
  });

  it("fails loudly when the markup is not what it expects", () => {
    expect(() => parseResults("<p>A redesigned page</p>")).toThrow(ParseError);
    expect(() => parseResults(`<span class="results-no">1-1 of 1 results</span><div class="profile-listing"><a href="/elsewhere"><h2>X</h2></a></div>`)).toThrow(ParseError);
  });
});
