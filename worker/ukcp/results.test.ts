import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { inOrder } from "../../shared/order";
import { fixture } from "../../shared/ukcp/__fixtures__";
import { parseResults } from "../../shared/ukcp/parseResults";
import { ParseError } from "../../shared/ukcp/text";
import { readResults } from "./results";

// The browser's parser is lent a DOMParser for this call alone, so nothing the Worker runs ever finds one.
function browserResults(html: string) {
  vi.stubGlobal("DOMParser", new JSDOM().window.DOMParser);
  try {
    const { total, from, to, locationSearched, therapists } = parseResults(html);
    const cards = therapists.map(({ slug, name, location, distance, sessionTypes, summary, tags }) => ({ slug, name, location, distance, sessionTypes, summary, tags }));
    return { total, from, to, locationSearched, cards };
  } finally {
    vi.unstubAllGlobals();
  }
}

const card = (slug: string, inner: string) => `<div class="profile-listing margin-b-md">
  <a href="therapist/${slug}" class="light-anchor">${inner}</a>
</div>`;
const page = (...cards: string[]) => `<span class="d-block results-no">1-${cards.length} of ${cards.length} results</span>${cards.join("\n")}`;
const near = (...cards: string[]) => page(...cards).replace("</span>", `</span><span class="results-location">Location searched: <strong>Bristol, UK</strong></span>`);
const at = (slug: string, distance?: string) =>
  card(slug, `<h2>${slug}</h2><span class="profile-listing-locations"><strong>Bristol BS1</strong>${distance ? ` (${distance} from Bristol)` : ""}</span>`);
const slugs = (cards: { slug: string }[]) => cards.map((c) => c.slug);
const bySlug = <T extends { slug: string }>(cards: T[]) => cards.toSorted((a, b) => (a.slug < b.slug ? -1 : 1));

describe("readResults", () => {
  it.each(["results-location.html", "results-no-location.html", "results-unknown-location.html", "results-empty.html"])(
    "reads %s as the browser's parser does, in UKCP's order or a seed's",
    (name) => {
      const html = fixture(name);
      const browser = browserResults(html);
      expect(readResults(html, 0, 1000)).toEqual(browser);
      const { cards, ...found } = readResults(html, 0, 1000, 7);
      expect({ ...found, cards: bySlug(cards) }).toEqual({ ...browser, cards: bySlug(browser.cards) });
    },
  );

  it("lists cards nearest first, those at the same distance in the seed's order, however UKCP shuffled them", () => {
    const away = (distance: string | undefined, ...names: string[]) => names.map((name) => ({ slug: `${name}-ID`, distance }));
    // UKCP lists a card it can't measure among those 0 miles away.
    const [none, nought] = [away(undefined, "Ed"), away("0 miles", "Al", "Bo", "Cy", "Di")];
    const [tenth, mile] = [away("0.1 miles", "Fi", "Gus", "Hal", "Ivy"), away("1 mile", "Jo")];
    const people = [...nought, ...none, ...tenth, ...mile];
    const ordered = slugs(inOrder(people.map(({ slug, distance }) => ({ slug, distance: distance && `${distance} from Bristol` })), 7));
    expect(ordered.slice(0, 5).toSorted()).toEqual(["Al-ID", "Bo-ID", "Cy-ID", "Di-ID", "Ed-ID"]);
    expect(ordered.at(-1)).toBe("Jo-ID");
    for (const shuffle of [people, [...none, ...nought.toReversed(), ...tenth.toReversed(), ...mile]]) {
      const html = near(...shuffle.map(({ slug, distance }) => at(slug, distance)));
      expect(slugs(readResults(html, 0, 12, 7).cards)).toEqual(ordered);
      expect(slugs(readResults(html, 2, 3, 7).cards)).toEqual(ordered.slice(2, 5));
      expect(slugs(readResults(html, 0, 12, 8).cards)).not.toEqual(ordered);
    }
  });

  it("keeps UKCP's order without a seed, reading no card past the last shown", () => {
    const html = page(at("Cy-ID"), at("Al-ID"), at("Bo-ID"), card("Broken", "<h2>No profile link</h2>").replace('href="therapist/Broken"', 'href="/"'));
    expect(slugs(readResults(html, 0, 3).cards)).toEqual(["Cy-ID", "Al-ID", "Bo-ID"]);
    expect(slugs(readResults(html, 1, 1).cards)).toEqual(["Al-ID"]);
    // A seed's order needs every card.
    expect(() => readResults(html, 0, 3, 7)).toThrow(ParseError);
  });

  it("reads only the cards after those skipped, as many as asked for", () => {
    const html = fixture("results-location.html");
    expect(readResults(html, 3, 2).cards).toEqual(browserResults(html).cards.slice(3, 5));
    expect(readResults(html, 3, 2, 7).cards).toEqual(readResults(html, 0, 1000, 7).cards.slice(3, 5));
    expect(readResults(html, 11, 5, 7).cards).toHaveLength(1);
    expect(readResults(html, 40, 12, 7)).toMatchObject({ total: 257, cards: [] });
  });

  it("reads a card's text as a browser shows it, markup and character references and all", () => {
    const html = page(
      card(
        "Zo%C3%AB-O&#x27;Brien-ABCDEFGH",
        `<h2>Zo&#xEB; O&#x92;Brien &lt;script&gt;</h2>
        <span class="profile-listing-locations"><strong>Hove  BN3</strong>
          (1.2 miles from Brighton)</span>
        <span class="profile-listing-contact-session-type"><strong>01234 567890</strong>
|&nbsp;In-person&nbsp;&amp;&nbsp;Remote</span>
        <p class="pt-2">Grief &amp; <em>loss</em>.&#x2026;</p>
        <ul class="tag-list"><li><span>Anger &amp;
          rage</span></li><li><span> </span></li><li><span>Loss</span></li></ul>`,
      ),
    );
    expect(readResults(html, 0, 12, 7).cards).toEqual(browserResults(html).cards);
    expect(readResults(html, 0, 12, 7).cards[0]).toEqual({
      slug: "Zo%C3%AB-O'Brien-ABCDEFGH",
      name: "Zoë O’Brien <script>",
      location: "Hove BN3",
      distance: "1.2 miles from Brighton",
      sessionTypes: "In-person & Remote",
      summary: "Grief & loss.…",
      tags: ["Anger & rage", "Loss"],
    });
  });

  it("keeps each card to its own link, so a card without a summary takes none from the next", () => {
    const html = page(card("Jo-Bloggs-ABCDEFGH", "<h2>Jo Bloggs</h2>"), card("Sam-Smith-ABCDEFGH", "<h2>Sam Smith</h2><p>Summary.</p>"));
    expect(bySlug(readResults(html, 0, 12, 7).cards).map((c) => c.summary)).toEqual([undefined, "Summary."]);
    const distances = readResults(near(card("Jo-Bloggs-ABCDEFGH", "<h2>Jo Bloggs</h2>"), at("Al-ID", "1 mile")), 0, 12, 7).cards;
    expect(distances.map((c) => [c.slug, c.distance])).toEqual([["Jo-Bloggs-ABCDEFGH", undefined], ["Al-ID", "1 mile from Bristol"]]);
  });

  it("calls a page it can't read unreadable", () => {
    expect(() => readResults("<p>Down for maintenance</p>", 0, 12, 7)).toThrow(ParseError);
    expect(() => readResults(`<span class="results-no">Lots</span>`, 0, 12, 7)).toThrow(ParseError);
    expect(() => readResults(page(card("Jo-Bloggs-ABCDEFGH", "<h3>Jo Bloggs</h3>")), 0, 12, 7)).toThrow(ParseError);
    expect(() => readResults(page(card("", "<h2>Jo Bloggs</h2>").replace('href="therapist/"', 'href="/"')), 0, 12, 7)).toThrow(ParseError);
  });
});
