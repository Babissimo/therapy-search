import { describe, expect, it } from "vitest";
import { emptyParams, InvalidParam, readParams, toQuery, ukcpProfileAddress, ukcpSearchUrl, type AllowedValues } from "./query";

const read = (query: string, allowed?: AllowedValues) => readParams(new URLSearchParams(query), allowed);
const canonical = (query: string) => toQuery(read(query));

describe("canonical query", () => {
  it("puts keys in a fixed order, sorts and de-duplicates values, trims text and drops defaults", () => {
    expect(canonical("Languages=Spanish&Location=%20Brighton%20&Languages=French&Languages=French&Distance=10&page=1")).toBe(
      "Location=Brighton&Languages=French&Languages=Spanish",
    );
  });

  it("keeps page and true flags, and drops a distance, which is fixed", () => {
    expect(canonical("page=3&OnlyWheelchairAccessible=true&OnlyProfilesWithPhotos=false&Distance=5&Location=Leeds")).toBe(
      "Location=Leeds&OnlyWheelchairAccessible=true&page=3",
    );
  });

  it("sorts and de-duplicates help-with terms", () => {
    expect(canonical("HelpWith=Trauma,%20Anxiety,Trauma,")).toBe("HelpWith=Anxiety%2C+Trauma");
  });

  it("ignores keys UKCP's form does not have, and its shuffle seed, which UKCP ignores", () => {
    expect(canonical("utm_source=newsletter&Location=Leeds")).toBe("Location=Leeds");
    expect(canonical("OrderSeed=7&HelpWithAdvanced=Anxiety")).toBe("HelpWithAdvanced=Anxiety");
  });

  it("is empty for the default search", () => {
    expect(toQuery(emptyParams())).toBe("");
  });
});

describe("readParams rejects what UKCP's form could not send", () => {
  it.each([
    ["page=0", "page"],
    ["OnlyProfilesWithPhotos=yes", "OnlyProfilesWithPhotos"],
    [`Location=${"x".repeat(201)}`, "Location"],
  ])("%s", (query, param) => {
    expect(() => read(query)).toThrow(expect.objectContaining({ name: "InvalidParam", param }));
  });

  it("rejects an option or help-with term UKCP does not offer, when given the allowed lists", () => {
    const allowed = { Languages: new Set(["French"]), HelpWith: new Set(["Anxiety"]) } as unknown as AllowedValues;
    expect(() => read("Languages=Klingon", allowed)).toThrow(InvalidParam);
    expect(() => read("HelpWith=Anxiety, Astrology", allowed)).toThrow(expect.objectContaining({ param: "HelpWith" }));
    expect(read("HelpWith=Anxiety", allowed).text.HelpWith).toBe("Anxiety");
  });

  it("accepts any number of known help-with terms, however long together", () => {
    const terms = ["Person-Centred Experiential Psychotherapeutic Counsellor", "Integrative Transpersonal Psychotherapeutic Counsellor", "Dynamic Interpersonal Psychotherapeutic Counsellor", "Cognitive Analytic Psychotherapist"];
    const allowed = { HelpWith: new Set(terms) } as unknown as AllowedValues;
    expect(read(`HelpWith=${encodeURIComponent(terms.join(", "))}`, allowed).text.HelpWith).toBe([...terms].sort().join(", "));
  });
});

describe("ukcpSearchUrl", () => {
  it("builds the same search on UKCP's site, reaching as far as ours", () => {
    expect(ukcpSearchUrl(read("Location=Leeds&Languages=Welsh"))).toBe(
      "https://www.psychotherapy.org.uk/find-a-therapist/?Location=Leeds&Languages=Welsh&Distance=30",
    );
    expect(ukcpSearchUrl(read("Languages=Welsh"))).toBe("https://www.psychotherapy.org.uk/find-a-therapist/?Languages=Welsh");
  });
});

describe("ukcpProfileAddress", () => {
  it("writes a therapist's UKCP page as a person would type it, leaving their name as it reads", () => {
    expect(ukcpProfileAddress("Ann-O’Neill-ABCDEFGH")).toBe("psychotherapy.org.uk/therapist/Ann-O’Neill-ABCDEFGH");
  });
});
