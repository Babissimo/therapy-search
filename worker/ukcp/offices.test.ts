import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "../../shared/ukcp/__fixtures__";
import { parseProfile } from "../../shared/ukcp/parseProfile";
import { officeDetails, officesIn } from "./offices";

const office = (address: string, cost?: string) => `<div class="profile-locations">
        <section>
            <h3>Office</h3>
            ${address}
            <br>
            <a href="https://www.google.com/maps/search/?api=1" target="_blank" class="mini-cta ">View Map</a>
            ${cost === undefined ? "" : `<h4 class="mb-0">Cost:</h4>\n                <span>\n                    ${cost}\n                </span>`}
        </section>
    </div>`;
const FOOTER = `<div class="col-12 col-md-3"><h2>Contact us</h2><address>America House<br>London EC3N 2LU</address></div>`;
const page = (...parts: string[]) => `<div class="therapist-header"><h1>Jo Bloggs</h1></div>${parts.join("\n")}${FOOTER}`;

describe("officeDetails", () => {
  it("answers the postcode and fee of the office the card names", () => {
    const html = page(
      office("<address>1 Old Steine<br>Brighton BN1 1EL</address>", "<strong class='cost'>&#163;60</strong>"),
      office("<address>2 Church Road<br>Hove BN3 2FL</address>", "<strong class='cost'>&#163;70</strong>"),
    );
    expect(officeDetails(html, "Hove BN3")).toEqual({ postcode: "BN3 2FL", cost: "£70" });
    expect(officeDetails(html, "Brighton BN1")).toEqual({ postcode: "BN1 1EL", cost: "£60" });
  });

  it("reads the fee as its text, with its line breaks", () => {
    const cost = "<strong class='cost'>&#163;70</strong> per session.<br><br>\u200bOnline sessions &amp; calls<br>Concessions";
    expect(officeDetails(page(office("<address>Hove BN3 2FL</address>", cost)), "Hove BN3").cost).toBe("£70 per session.\n\nOnline sessions & calls\nConcessions");
  });

  it("leaves a character reference it doesn't know as written", () => {
    expect(officeDetails(page(office("<address>Hove BN3 2FL</address>", "&constructor; &toString; &#x2014; £70")), "Hove BN3").cost).toBe("&constructor; &toString; — £70");
  });

  it("reads a postcode written without its space, in small letters or with a non-breaking space", () => {
    expect(officeDetails(page(office("<address>2 Church Road<br>hove bn32fl</address>")), "hove bn32fl")).toEqual({ postcode: "BN3 2FL" });
    expect(officeDetails(page(office("<address>Hove BN3&nbsp;2FL</address>")), "Hove BN3")).toEqual({ postcode: "BN3 2FL" });
  });

  it("answers what the office gives: a fee without a postcode, or nothing", () => {
    const html = page(office("<address>Brighton BN1</address>", "£70"), office("<address>Lewes</address>"));
    expect(officeDetails(html, "Brighton BN1")).toEqual({ cost: "£70" });
    expect(officeDetails(html, "Lewes")).toEqual({});
    expect(officeDetails(html, "Hove BN3")).toEqual({});
  });

  it("takes the fee from the named office's own section", () => {
    const html = page(office("<address>Brighton BN1 1EL</address>"), office("<address>Hove BN3 2FL</address>", "£70"));
    expect(officeDetails(html, "Brighton BN1")).toEqual({ postcode: "BN1 1EL" });
  });

  it("never reads an address outside the office sections, such as UKCP's own in the footer", () => {
    expect(officeDetails(page(office("<address>Hove BN3 2FL</address>")), "London EC3N")).toEqual({});
    // An office with no address stops at its own section's end rather than running on into the footer.
    expect(officeDetails(page(office("")), "London EC3N")).toEqual({});
    const other = `<div class="profile-locations-map"><section><address>London EC3N 2LU</address></section></div>`;
    expect(officeDetails(page(other), "London EC3N")).toEqual({});
  });

  it("finds an office section among other classes on its element, or after other markup within it", () => {
    const html = page(office("<address>Hove BN3 2FL</address>").replace('class="profile-locations"', 'class="mb-3 profile-locations"'));
    expect(officeDetails(html, "Hove BN3")).toEqual({ postcode: "BN3 2FL" });
    const headed = page(office("<address>Hove BN3 2FL</address>", "£70").replace("<section>", "<h2>Where I work</h2><!-- office --><section>"));
    expect(officeDetails(headed, "Hove BN3")).toEqual({ postcode: "BN3 2FL", cost: "£70" });
  });

  it("reads the offices of a profile page as UKCP writes it", () => {
    expect(officeDetails(fixture("profile.html"), "Testtown AB1")).toEqual({
      postcode: "AB1 2CD",
      cost: "£70 per fifty-minute session.\n\nOnline video-call sessions are payable in advance: debit/credit card, PayPal or bank transfer.",
    });
  });
});

describe("officesIn", () => {
  // The browser's parser is lent a DOMParser for this call alone, so nothing the Worker runs ever finds one.
  const browserOffices = (html: string) => {
    vi.stubGlobal("DOMParser", new JSDOM().window.DOMParser);
    try {
      return parseProfile(html, "Jo-Bloggs-ABCDEFGH").offices.map(({ address, cost }) => ({ address, cost }));
    } finally {
      vi.unstubAllGlobals();
    }
  };

  it("reads each office's address and fee as the browser's parser does", () => {
    const html = fixture("profile.html");
    expect(officesIn(html)).toHaveLength(2);
    expect(officesIn(html)).toEqual(browserOffices(html));
  });

  it("reads a fee as the browser's parser does: all that follows its heading, up to the next", () => {
    const loose = `<div class="profile-locations"><section><h3>Office</h3><address>Hove BN3 2FL</address>
<h4>Cost:</h4>£70 a session<br><span>Concessions</span>
<p>Ask about evenings</p><h4>Languages</h4><span>English</span></section></div>`;
    expect(officesIn(page(loose))).toEqual([{ address: ["Hove BN3 2FL"], cost: "£70 a session\nConcessions\nAsk about evenings" }]);
    expect(browserOffices(page(loose))).toEqual(officesIn(page(loose)));
  });
});
