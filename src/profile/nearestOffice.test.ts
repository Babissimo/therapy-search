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
  it("finds the office the card names", () => {
    const offices = [office("121 Foredown Drive", "Portslade BN41 2BF"), office("Brighton Therapy Centre", "23A New Road", "Brighton BN1 1UG", "England")];
    expect(nearestOffice(offices, card("Brighton BN1"))).toBe(1);
  });

  it("finds none where the card measured no distance, named no place, or named one no office has", () => {
    const offices = [office("Brighton BN1 1UG")];
    expect(nearestOffice(offices, { ...card("Brighton BN1"), distance: undefined })).toBeUndefined();
    expect(nearestOffice(offices, card(undefined))).toBeUndefined();
    expect(nearestOffice(offices, card("Hove BN3"))).toBeUndefined();
    expect(nearestOffice(offices, undefined)).toBeUndefined();
  });
});
