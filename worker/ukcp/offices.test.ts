import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { officePostcode } from "./offices";

const office = (address: string) => `<div class="profile-locations">
        <section>
            <h3>Office</h3>
            ${address}
            <br>
            <a href="https://www.google.com/maps/search/?api=1" target="_blank" class="mini-cta ">View Map</a>
        </section>
    </div>`;
const FOOTER = `<div class="col-12 col-md-3"><h2>Contact us</h2><address>America House<br>London EC3N 2LU</address></div>`;
const page = (...parts: string[]) => `<div class="therapist-header"><h1>Jo Bloggs</h1></div>${parts.join("\n")}${FOOTER}`;

describe("officePostcode", () => {
  it("finds the postcode of the office in the district asked for", () => {
    const html = page(office("<address>1 Old Steine<br>Brighton BN1 1EL</address>"), office("<address>2 Church Road<br>Hove BN3 2FL</address>"));
    expect(officePostcode(html, "BN3")).toBe("BN3 2FL");
    expect(officePostcode(html, "BN1")).toBe("BN1 1EL");
  });

  it("reads a postcode written without its space, in small letters or with a non-breaking space", () => {
    expect(officePostcode(page(office("<address>2 Church Road<br>hove<br>bn32fl</address>")), "BN3")).toBe("BN3 2FL");
    expect(officePostcode(page(office("<address>Hove BN3&nbsp;2FL</address>")), "BN3")).toBe("BN3 2FL");
  });

  it("takes the first of two offices in the district", () => {
    const html = page(office("<address>Hove BN3 2FL</address>"), office("<address>Hove BN3 7AA</address>"));
    expect(officePostcode(html, "BN3")).toBe("BN3 2FL");
  });

  it("finds none when the office in the district gives no more than the district", () => {
    expect(officePostcode(page(office("<address>Brighton BN1</address>")), "BN1")).toBeUndefined();
  });

  it("never reads an address outside the office sections, such as UKCP's own in the footer", () => {
    expect(officePostcode(page(office("<address>Hove BN3 2FL</address>")), "EC3N")).toBeUndefined();
    // An office with no address stops at its own section's end rather than running on into the footer.
    expect(officePostcode(page(office("")), "EC3N")).toBeUndefined();
    const other = `<div class="profile-locations-map"><section><address>London EC3N 2LU</address></section></div>`;
    expect(officePostcode(page(other), "EC3N")).toBeUndefined();
  });

  it("finds an office section among other classes on its element", () => {
    const html = page(office("<address>Hove BN3 2FL</address>").replace('class="profile-locations"', 'class="mb-3 profile-locations"'));
    expect(officePostcode(html, "BN3")).toBe("BN3 2FL");
  });

  it("reads the offices of a profile page as UKCP writes it", () => {
    const html = readFileSync(new URL("../../shared/ukcp/__fixtures__/profile.html", import.meta.url), "utf8");
    expect(officePostcode(html, "AB1")).toBe("AB1 2CD");
  });
});
