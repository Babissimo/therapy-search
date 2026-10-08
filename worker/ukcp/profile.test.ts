import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../../shared/ukcp/__fixtures__";
import { parseContact } from "../../shared/ukcp/parseContact";
import { parseProfile } from "../../shared/ukcp/parseProfile";
import { ParseError } from "../../shared/ukcp/text";
import { readContact, readProfile } from "./profile";

// The browser's parsers are lent a DOMParser for this call alone, so nothing the Worker runs ever finds one.
function lent<T>(read: () => T): T {
  vi.stubGlobal("DOMParser", new JSDOM().window.DOMParser);
  try {
    return read();
  } finally {
    vi.unstubAllGlobals();
  }
}

function browserProfile(html: string) {
  const { name, location, languages, email, contactId, emailInContact, about, practical, offices } = lent(() => parseProfile(html, "Jo-Bloggs-ABCDEFGH"));
  return { name, location, languages, email, contactId, emailInContact, about, practical, offices: offices.map(({ mapUrl: _, ...office }) => office) };
}

const page = (body: string) => `<div class="therapist-header"><div class="row"><h1>Jo Bloggs</h1></div></div>${body}`;

describe("readProfile", () => {
  it("reads a profile page as the browser's parser does", () => {
    const html = fixture("profile.html");
    const profile = readProfile(html);
    expect(profile).toEqual(browserProfile(html));
    expect(profile.about.map((s) => s.heading)).toContain("Special Interests");
    expect(profile.offices.map((o) => [o.name, o.isMain])).toEqual([
      ["Brighton Office", true],
      ["London Office", false],
    ]);
  });

  it("reads sections as the browser's parser does: paragraphs, items and details, without UKCP's stock line, and none left empty", () => {
    const html = page(`<div class="profile-bio"><section><h2>About &amp; more</h2>
      <p>One.<br><br>Two &#x2014; <strong>bold</strong>.</p><span>Working with children.</span>
      <ul><li>Couples</li><li><span>Families</span></li></ul>
      <div id="Interests"><div class="accordion-item"><button class="accordion-header">Grief</button>
        <div class="accordion-body collapse"><div><span>Line one.&#xA;Line two.</span></div></div></div></div>
    </section><section><h2>Empty</h2></section><div><section><h2>Nested</h2><p>Not the bio's own.</p></section></div></div>
    <div class="profile-practical-information"><section><h3>Types of sessions</h3><ul><li>Online Therapy</li></ul></section>
      <section><h2>Working with Children</h2><span>For more information about therapy for children and young people,
        <a href="/psychotherapy-training/working-with-children-and-young-people/">visit our info page</a>.</span></section>
      <div class="profile-locations"><section><h3>Office</h3><address>Hove BN3 2FL</address></section></div></div>`);
    expect(readProfile(html)).toEqual(browserProfile(html));
    expect(readProfile(html).about).toEqual([
      {
        heading: "About & more",
        paragraphs: ["One.", "Two — bold.", "Working with children."],
        items: ["Couples", "Families"],
        details: [{ title: "Grief", text: "Line one.\nLine two." }],
      },
    ]);
    expect(readProfile(html).practical.map((s) => s.heading)).toEqual(["Types of sessions"]);
  });

  it("gives no contact id where UKCP has no details, however it quotes saying so", () => {
    const html = page(`<div class="therapist-contacts"><div class="collapse therapist-contacts-details" data-id="9" data-nodata='true'></div></div>`);
    expect(readProfile(html).contactId).toBeUndefined();
    expect(readProfile(html)).toEqual(browserProfile(html));
    expect(readProfile(page(`<div class="therapist-contacts-details" data-id="9"></div>`)).contactId).toBe("9");
  });

  it("takes an email the page gives outright, never a link to share the page", () => {
    const html = page(`<div class="therapist-contacts"><a href="mailto:?subject=Jo">Share</a><a href="mailto:jo%40example.com?subject=Hello">Email</a></div>`);
    expect(readProfile(html).email).toBe("jo@example.com");
  });

  it("calls a page without the therapist's name unreadable", () => {
    expect(() => readProfile("<h1>UKCP</h1>")).toThrow(ParseError);
  });
});

describe("readContact", () => {
  it("reads contact details as the browser's parser does", () => {
    const html = fixture("contact.html");
    expect(readContact(html)).toEqual(lent(() => parseContact(html)));
    expect(readContact(html)).toEqual({ phone: "01234 567890", email: "therapist@example.com", website: "https://example.invalid/" });
  });

  it("gives a website only when it is an http(s) link", () => {
    const html = `<div class="therapist-contacts-details-web"><a href="javascript:alert(1)">Site</a></div>`;
    expect(readContact(html)).toEqual({ phone: undefined, email: undefined, website: undefined });
  });
});
