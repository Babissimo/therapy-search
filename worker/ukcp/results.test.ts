import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../../shared/ukcp/__fixtures__";
import { parseResults } from "../../shared/ukcp/parseResults";
import { ParseError } from "../../shared/ukcp/text";
import { readResults } from "./results";

// The browser's parser is lent a DOMParser for this call alone, so nothing the Worker runs ever finds one.
function browserResults(html: string) {
  vi.stubGlobal("DOMParser", new JSDOM().window.DOMParser);
  try {
    const { total, from, to, locationSearched, therapists } = parseResults(html);
    const cards = therapists.map(({ slug, name, location, distance, sessionTypes, summary }) => ({ slug, name, location, distance, sessionTypes, summary }));
    return { total, from, to, locationSearched, cards };
  } finally {
    vi.unstubAllGlobals();
  }
}

const card = (slug: string, inner: string) => `<div class="profile-listing margin-b-md">
  <a href="therapist/${slug}" class="light-anchor">${inner}</a>
</div>`;
const page = (...cards: string[]) => `<span class="d-block results-no">1-${cards.length} of ${cards.length} results</span>${cards.join("\n")}`;

describe("readResults", () => {
  it.each(["results-location.html", "results-no-location.html", "results-unknown-location.html", "results-empty.html"])(
    "reads %s as the browser's parser does",
    (name) => {
      const html = fixture(name);
      expect(readResults(html, 0, 1000)).toEqual(browserResults(html));
    },
  );

  it("reads only the cards after those skipped, as many as asked for", () => {
    const html = fixture("results-location.html");
    expect(readResults(html, 3, 2).cards).toEqual(browserResults(html).cards.slice(3, 5));
    expect(readResults(html, 11, 5).cards).toHaveLength(1);
    expect(readResults(html, 40, 12)).toMatchObject({ total: 257, cards: [] });
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
        <p class="pt-2">Grief &amp; <em>loss</em>.&#x2026;</p>`,
      ),
    );
    expect(readResults(html, 0, 12).cards).toEqual(browserResults(html).cards);
    expect(readResults(html, 0, 12).cards[0]).toEqual({
      slug: "Zo%C3%AB-O'Brien-ABCDEFGH",
      name: "Zoë O’Brien <script>",
      location: "Hove BN3",
      distance: "1.2 miles from Brighton",
      sessionTypes: "In-person & Remote",
      summary: "Grief & loss.…",
    });
  });

  it("keeps each card to its own link, so a card without a summary takes none from the next", () => {
    const html = page(card("Jo-Bloggs-ABCDEFGH", "<h2>Jo Bloggs</h2>"), card("Sam-Smith-ABCDEFGH", "<h2>Sam Smith</h2><p>Summary.</p>"));
    expect(readResults(html, 0, 12).cards.map((c) => c.summary)).toEqual([undefined, "Summary."]);
  });

  it("calls a page it can't read unreadable", () => {
    expect(() => readResults("<p>Down for maintenance</p>", 0, 12)).toThrow(ParseError);
    expect(() => readResults(`<span class="results-no">Lots</span>`, 0, 12)).toThrow(ParseError);
    expect(() => readResults(page(card("Jo-Bloggs-ABCDEFGH", "<h3>Jo Bloggs</h3>")), 0, 12)).toThrow(ParseError);
    expect(() => readResults(page(card("", "<h2>Jo Bloggs</h2>").replace('href="therapist/"', 'href="/"')), 0, 12)).toThrow(ParseError);
  });
});
