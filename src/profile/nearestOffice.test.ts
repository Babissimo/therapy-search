import { describe, expect, it } from "vitest";
import type { Office, TherapistCard } from "@shared/types";
import { nearestOffice } from "./nearestOffice";

const office = (...address: string[]): Office => ({ name: "Office", isMain: false, address });
const card = (location: string | undefined): TherapistCard => ({
  slug: "Jo-ABCDEFGH",
  name: "Jo Bloggs",
  initials: "JB",
  location,
  distance: "0.1 miles from Brighton",
  tags: [],
});

describe("nearestOffice", () => {
  it("finds the office whose town and postcode begin with the card's", () => {
    const offices = [office("121 Foredown Drive", "Portslade BN41 2BF"), office("Brighton Therapy Centre", "23A New Road", "Brighton BN1 1UG", "England")];
    expect(nearestOffice(offices, card("Brighton BN1"))).toBe(1);
  });

  it("tells apart offices in one town by their postcodes", () => {
    const offices = [office("Brighton Therapy Centre", "Brighton BN1 1UG"), office("The Rock Clinic", "270 Eastern Road", "Brighton BN2 5TA")];
    expect(nearestOffice(offices, card("Brighton BN2"))).toBe(1);
  });

  it("takes a postcode written without its space as the card does, whole", () => {
    const offices = [office("Sandgate Road", "Fiveways", "Brighton BN16JP"), office("28 New Road", "Brighton BN1 1UG")];
    expect(nearestOffice(offices, card("Brighton BN1"))).toBe(1);
    expect(nearestOffice(offices, card("Brighton BN16JP"))).toBe(0);
  });

  it("matches a card with no town, or no postcode, and ignores case", () => {
    expect(nearestOffice([office("London NW3 5LL"), office("BN1 1UG", "United Kingdom (UK)")], card("BN1"))).toBe(1);
    expect(nearestOffice([office("Lewes"), office("Brighton")], card("Brighton"))).toBe(1);
    expect(nearestOffice([office("London W1G 9SH"), office("Brighton & Hove", "BRIGHTON BN3 6HF", "UK")], card("BRIGHTON BN3"))).toBe(1);
  });

  it("prefers a line that is the card's whole name to one that goes on", () => {
    expect(nearestOffice([office("Brighton BN1 1UG"), office("Brighton")], card("Brighton"))).toBe(1);
  });

  it("takes the first of offices that match alike", () => {
    expect(nearestOffice([office("57 Ship Street", "Brighton BN1 1AF"), office("57 Ship Street", "Brighton BN1 1AF")], card("Brighton BN1"))).toBe(0);
  });

  it("finds none where the card measured no distance, named no place, or named one no office has", () => {
    const offices = [office("Brighton BN1 1UG")];
    expect(nearestOffice(offices, { ...card("Brighton BN1"), distance: undefined })).toBeUndefined();
    expect(nearestOffice(offices, card(undefined))).toBeUndefined();
    expect(nearestOffice(offices, card("Hove BN3"))).toBeUndefined();
    expect(nearestOffice(offices, undefined)).toBeUndefined();
  });
});
