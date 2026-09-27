import { describe, expect, it } from "vitest";
import { redact } from "./redact";

const CARD = `<div class="profile-listing"><a href="therapist/Jane-Real-Person-AbCd1234">
<img src="https://saukcp.blob.core.windows.net/ukcp-media/x/jane.jpeg" class="profile-photo" alt="Jane Real Person, UKCP Accredited Psychotherapist" />
<h2>Jane Real Person</h2>
<span class="profile-listing-locations"><strong>LEEDS LS1</strong> (2 miles from Leeds)</span>
<span class="profile-listing-contact-session-type"><strong>07700 900123</strong> | In-person</span>
<p>I am Jane and you can write to jane@realperson.co.uk.</p></a></div>`;

describe("redact", () => {
  const out = redact(CARD);

  it("removes names, slugs, phones, emails, photos and places", () => {
    for (const real of ["Jane", "Real Person", "AbCd1234", "07700 900123", "realperson", "saukcp", "LEEDS LS1"]) {
      expect(out).not.toContain(real);
    }
  });

  it("keeps the structure and the search's own wording", () => {
    expect(out).toContain('href="therapist/Test-Therapist-1-TESTID01"');
    expect(out).toContain("<h2>Test Therapist 1</h2>");
    expect(out).toContain("(2 miles from Leeds)");
    expect(out).toContain("| In-person");
  });

  it("replaces slugs made from names with accents or apostrophes", () => {
    const out = redact(`<a href="therapist/Zo%C3%AB-O%27Neill-QwErTy12"></a><a href="therapist/Zoë-D'Arcy-AsDfGh34"></a>`);
    expect(out).not.toMatch(/Zo|Neill|Arcy/);
    expect(out).toContain('href="therapist/Test-Therapist-1-TESTID01"');
  });

  it("replaces phone-like numbers left anywhere else", () => {
    expect(redact("<p>Call 0121 504 3691 or +44 7700 900123</p>")).toBe("<p>Call 01234 567890 or 01234 567890</p>");
  });
});
