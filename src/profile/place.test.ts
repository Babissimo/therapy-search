import { describe, expect, it } from "vitest";
import type { Office } from "@shared/types";
import { officeText } from "./place";

const office = (address: string[], isMain = false): Office => ({ name: "Office", isMain, address });

describe("officeText", () => {
  it("takes the postcode, wherever it sits in the address", () => {
    expect(officeText(office(["2 Sea Road", "Hove bn3 1aa", "UK"], true), "Brighton")).toBe("BN3 1AA");
  });

  it("otherwise places the main office where UKCP lists the therapist", () => {
    expect(officeText(office(["The Clinic", "12 High Street"], true), "Lewes")).toBe("LEWES");
    expect(officeText(office(["Hove"], true), " ")).toBe("HOVE");
  });

  it("otherwise takes the last line, leaving out the nation", () => {
    expect(officeText(office(["1 High Street", "Lewes"]), "Brighton")).toBe("LEWES");
    expect(officeText(office(["Soho", "London W1"]), undefined)).toBe("LONDON W1");
    expect(officeText(office(["Brighton", "England"]), undefined)).toBe("BRIGHTON");
    expect(officeText(office(["Swansea, Wales."]), undefined)).toBe("SWANSEA");
    expect(officeText(office(["Fitzrovia", "London W1W", "United Kingdom (UK)"]), undefined)).toBe("LONDON W1W");
    expect(officeText(office(["Fitzrovia", "London W1W, united kingdom (uk)"]), undefined)).toBe("LONDON W1W");
    expect(officeText(office(["New England"]), undefined)).toBe("NEW ENGLAND");
  });

  it("has nothing to place for an office with no address, or only a nation", () => {
    expect(officeText(office([]), undefined)).toBeUndefined();
    expect(officeText(office(["England"]), undefined)).toBeUndefined();
  });
});
