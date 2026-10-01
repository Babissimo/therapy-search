import { describe, expect, it } from "vitest";
import { officeNamed } from "./office";

const office = (...address: string[]) => ({ address });

describe("officeNamed", () => {
  it("finds the office whose town and postcode begin with the card's", () => {
    const offices = [office("121 Foredown Drive", "Portslade BN41 2BF"), office("Brighton Therapy Centre", "23A New Road", "Brighton BN1 1UG", "England")];
    expect(officeNamed(offices, "Brighton BN1")).toBe(1);
  });

  it("tells apart offices in one town by their postcodes", () => {
    const offices = [office("Brighton Therapy Centre", "Brighton BN1 1UG"), office("The Rock Clinic", "270 Eastern Road", "Brighton BN2 5TA")];
    expect(officeNamed(offices, "Brighton BN2")).toBe(1);
  });

  it("takes a postcode written without its space as the card does, whole", () => {
    const offices = [office("Sandgate Road", "Fiveways", "Brighton BN16JP"), office("28 New Road", "Brighton BN1 1UG")];
    expect(officeNamed(offices, "Brighton BN1")).toBe(1);
    expect(officeNamed(offices, "Brighton BN16JP")).toBe(0);
  });

  it("matches a card with no town, or no postcode, and ignores case and spacing", () => {
    expect(officeNamed([office("London NW3 5LL"), office("BN1 1UG", "United Kingdom (UK)")], "BN1")).toBe(1);
    expect(officeNamed([office("Lewes"), office("Brighton")], "Brighton ")).toBe(1);
    expect(officeNamed([office("London W1G 9SH"), office("Brighton & Hove", "BRIGHTON BN3 6HF", "UK")], "BRIGHTON  BN3")).toBe(1);
  });

  it("prefers a line that is the card's whole name to one that goes on", () => {
    expect(officeNamed([office("Brighton BN1 1UG"), office("Brighton")], "Brighton")).toBe(1);
  });

  it("takes the first of offices that match alike", () => {
    expect(officeNamed([office("57 Ship Street", "Brighton BN1 1AF"), office("57 Ship Street", "Brighton BN1 1AF")], "Brighton BN1")).toBe(0);
  });

  it("finds none for a place no office has, or no place at all", () => {
    expect(officeNamed([office("Brighton BN1 1UG")], "Hove BN3")).toBeUndefined();
    expect(officeNamed([office("Brighton BN1 1UG")], " ")).toBeUndefined();
  });
});
