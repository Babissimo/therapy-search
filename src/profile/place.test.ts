import { describe, expect, it } from "vitest";
import type { Office } from "@shared/types";
import { officeLookup } from "./place";

const office = (address: string[], isMain = false): Office => ({ name: "Office", isMain, address });
const home = (text: string) => ({ texts: [text] });
const abroad = (country: string, ...texts: string[]) => ({ texts, country });

describe("officeLookup", () => {
  it("takes the postcode, wherever it sits in the address, and whatever country follows it", () => {
    expect(officeLookup(office(["2 Sea Road", "Hove bn3 1aa", "UK"], true), "Brighton")).toEqual(home("BN3 1AA"));
    expect(officeLookup(office(["Belfast BT1 1AA", "Ireland"]), undefined)).toEqual(home("BT1 1AA"));
  });

  it("otherwise places the main office where UKCP lists the therapist", () => {
    expect(officeLookup(office(["The Clinic", "12 High Street"], true), "Lewes")).toEqual(home("LEWES"));
    expect(officeLookup(office(["Hove"], true), " ")).toEqual(home("HOVE"));
  });

  it("otherwise takes the last line, leaving out the nation", () => {
    expect(officeLookup(office(["1 High Street", "Lewes"]), "Brighton")).toEqual(home("LEWES"));
    expect(officeLookup(office(["Soho", "London W1"]), undefined)).toEqual(home("LONDON W1"));
    expect(officeLookup(office(["Brighton", "England"]), undefined)).toEqual(home("BRIGHTON"));
    expect(officeLookup(office(["Swansea, Wales."]), undefined)).toEqual(home("SWANSEA"));
    expect(officeLookup(office(["Fitzrovia", "London W1W", "United Kingdom (UK)"]), undefined)).toEqual(home("LONDON W1W"));
    expect(officeLookup(office(["Fitzrovia", "London W1W, united kingdom (uk)"]), undefined)).toEqual(home("LONDON W1W"));
    expect(officeLookup(office(["New England"]), undefined)).toEqual(home("NEW ENGLAND"));
  });

  it("looks for an office abroad in its country, by its whole address and then less of it each time", () => {
    expect(officeLookup(office(["Belzinger Ring", "Berlin 12689", "Germany"]), undefined)).toEqual(abroad("de", "BELZINGER RING BERLIN 12689", "BERLIN 12689"));
    expect(officeLookup(office(["Suite 5", "12 Rue Cler, Paris, France."]), undefined)).toEqual(
      abroad("fr", "SUITE 5 12 RUE CLER PARIS", "12 RUE CLER PARIS", "PARIS"),
    );
    expect(officeLookup(office(["Blackrock", "Ireland"], true), "London NW11")).toEqual(abroad("ie", "BLACKROCK"));
  });

  it("knows a country by its common names and spellings", () => {
    expect(officeLookup(office(["Manhattan", "USA"]), undefined)).toEqual(abroad("us", "MANHATTAN"));
    expect(officeLookup(office(["New York 10010", "United States"]), undefined)).toEqual(abroad("us", "NEW YORK 10010"));
    expect(officeLookup(office(["Amsterdam", "The Netherlands"]), undefined)).toEqual(abroad("nl", "AMSTERDAM"));
    expect(officeLookup(office(["Abidjan", "Cote d'Ivoire"]), undefined)).toEqual(abroad("ci", "ABIDJAN"));
    expect(officeLookup(office(["Port of Spain", "Trinidad and Tobago"]), undefined)).toEqual(abroad("tt", "PORT OF SPAIN"));
    expect(officeLookup(office(["Kowloon", "Hong Kong"]), undefined)).toEqual(abroad("hk", "KOWLOON"));
  });

  it("has nothing to place for an office with no address, or only a nation or country", () => {
    expect(officeLookup(office([]), undefined)).toBeUndefined();
    expect(officeLookup(office(["England"]), undefined)).toBeUndefined();
    expect(officeLookup(office(["Germany"]), undefined)).toBeUndefined();
  });
});
