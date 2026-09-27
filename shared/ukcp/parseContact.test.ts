// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fixture } from "./__fixtures__";
import { parseContact } from "./parseContact";

describe("parseContact", () => {
  it("reads telephone, email and website from a captured response", () => {
    expect(parseContact(fixture("contact.html"))).toEqual({
      phone: "01234 567890",
      email: "therapist@example.com",
      website: "https://example.invalid/",
    });
  });

  it("leaves out what the therapist has not listed, and any non-web link", () => {
    const html = `<div class="therapist-contacts-details-web"><a href="javascript:alert(1)">site</a></div>`;
    expect(parseContact(html)).toEqual({ phone: undefined, email: undefined, website: undefined });
  });
});
