import { describe, expect, it } from "vitest";
import { emptyParams, InvalidParam, readParams, toQuery, ukcpSearchUrl, type AllowedValues } from "./query";

const read = (query: string, allowed?: AllowedValues) => readParams(new URLSearchParams(query), allowed);
const canonical = (query: string, options?: { withSeed?: boolean }) => toQuery(read(query), options);

describe("canonical query", () => {
  it("puts keys in a fixed order, sorts and de-duplicates values, trims text and drops defaults", () => {
    expect(canonical("Languages=Spanish&Location=%20Brighton%20&Languages=French&Languages=French&Distance=10&page=1")).toBe(
      "Location=Brighton&Languages=French&Languages=Spanish",
    );
  });

  it("keeps non-default distance, page and true flags", () => {
    expect(canonical("page=3&OnlyWheelchairAccessible=true&OnlyProfilesWithPhotos=false&Distance=5&Location=Leeds")).toBe(
      "Location=Leeds&Distance=5&OnlyWheelchairAccessible=true&page=3",
    );
  });

  it("sorts and de-duplicates help-with terms", () => {
    expect(canonical("HelpWith=Trauma,%20Anxiety,Trauma,")).toBe("HelpWith=Anxiety%2C+Trauma");
  });

  it("ignores keys UKCP's form does not have", () => {
    expect(canonical("utm_source=newsletter&Location=Leeds")).toBe("Location=Leeds");
  });

  it("sends the seed only when asked and only without a location", () => {
    expect(canonical("OrderSeed=7&HelpWithAdvanced=Anxiety")).toBe("HelpWithAdvanced=Anxiety");
    expect(canonical("OrderSeed=7&HelpWithAdvanced=Anxiety", { withSeed: true })).toBe("HelpWithAdvanced=Anxiety&OrderSeed=7");
    expect(canonical("OrderSeed=7&Location=Leeds", { withSeed: true })).toBe("Location=Leeds");
  });

  it("is empty for the default search", () => {
    expect(toQuery(emptyParams())).toBe("");
  });
});

describe("readParams rejects what UKCP's form could not send", () => {
  it.each([
    ["Distance=31", "Distance"],
    ["Distance=2.5", "Distance"],
    ["page=0", "page"],
    ["OnlyProfilesWithPhotos=yes", "OnlyProfilesWithPhotos"],
    [`Location=${"x".repeat(201)}`, "Location"],
    ["OrderSeed=abc", "OrderSeed"],
    ["OrderSeed=0", "OrderSeed"],
    ["OrderSeed=65", "OrderSeed"],
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
  it("builds the same search on UKCP's site", () => {
    expect(ukcpSearchUrl(read("Location=Leeds&Languages=Welsh"))).toBe(
      "https://www.psychotherapy.org.uk/find-a-therapist/?Location=Leeds&Languages=Welsh",
    );
  });
});
