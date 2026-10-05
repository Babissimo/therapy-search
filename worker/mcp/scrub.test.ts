import { describe, expect, it } from "vitest";
import { ON_PROFILE, scrub, scrubbed } from "./scrub";

describe("scrub", () => {
  it.each([
    "07700 900123",
    "07700900123",
    "07700-900-123",
    "07700–900123",
    "+44 7700 900123",
    "+44 (0)7700 900 123",
    "+447700900123",
    "+44-7700-900123",
    "+44.7700.900123",
    "(+44) 7700 900123",
    "(+44)7700900123",
    "0044 7700 900123",
    "020 7946 0018",
    "(020) 7946 0018",
    "0117 496 0000",
    "01632 960123",
    "0800 123 4567",
    "0300 123 4567",
    "jane.doe@example.co.uk",
    "J_Smith+therapy@clinic.example",
  ])("replaces %s", (contact) => {
    expect(scrub(`Call or write: ${contact}, any time.`)).toBe(`Call or write: ${ON_PROFILE}, any time.`);
  });

  it.each([
    "Qualified in 2009, accredited in 2012.",
    "Sessions are 50 minutes and cost £60.",
    "Bristol BS8 1TH",
    "0.6 miles from Bristol",
    "From 1999-2004 I worked in the NHS.",
    "On 01/02/2020 I opened my practice.",
    "UKCP registration 0123456.",
    "Find me on Twitter @janedoe.",
    "In 2044 7700 clients were seen.",
    "Rate 44 7700 900123.",
  ])("keeps %s", (text) => {
    expect(scrub(text)).toBe(text);
  });
});

describe("scrubbed", () => {
  it("scrubs every string however deep it sits, and leaves the rest as it is", () => {
    const profile = {
      name: "Jane Doe",
      about: { paragraphs: ["Call 07700 900123.", "I work in Bristol.", "Write to jane@example.com."], main: true, fees: undefined, miles: 0.6 },
    };
    expect(scrubbed(profile)).toStrictEqual({
      name: "Jane Doe",
      about: { paragraphs: [`Call ${ON_PROFILE}.`, "I work in Bristol.", `Write to ${ON_PROFILE}.`], main: true, fees: undefined, miles: 0.6 },
    });
  });
});
