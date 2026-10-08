import { describe, expect, it } from "vitest";
import { feeKinds, feeLine, type FeeKind } from "./fee";

const line = (cost: string | undefined, wanted: FeeKind[] = []) => feeLine(cost, wanted).text;

describe("feeLine", () => {
  it("gives an office's one amount as it stands, in whole pounds where it has no pence", () => {
    expect(feeLine("£70")).toEqual({ text: "£70", given: true });
    expect(line("£63 for 50 minutes.")).toBe("£63");
    expect(line("My fees are £60.")).toBe("£60");
    expect(line("£85.00")).toBe("£85");
    expect(line("£62.50 per session")).toBe("£62.50");
    expect(line("£1,200 for a block of twelve")).toBe("£1,200");
    expect(line("£85/session")).toBe("£85");
  });

  it("gives the span of several amounts, a range's included", () => {
    expect(line("£75\n£85 for slots after 6pm")).toBe("£75–£85");
    expect(line("Full rate: £80 (50 min)\n\nMiddle rate: £70 (50 mins)\n\nLower rate: £60 (50 mins)")).toBe("£60–£80");
    expect(line("My fees are £60 -70")).toBe("£60–£70");
    expect(line("£60–£100 sliding scale")).toBe("£60–£100");
    expect(line("£70 to £80 per session")).toBe("£70–£80");
  });

  it("reads a smaller number or a length after a dash as something other than a range's end", () => {
    expect(line("£70 - 50 minute sessions")).toBe("£70");
    expect(line("£60 - 90 minutes")).toBe("£60");
    expect(line("£90 - 2 hours")).toBe("£90");
    expect(line("£60 - 90 mins, £45 - 50 mins")).toBe("£45–£60");
  });

  it("says where fees start when the office does, and not for one amount repeated", () => {
    expect(line("From £70 per 50 minute session")).toBe("From £70");
    expect(line("£70 online, or £70 in person")).toBe("£70");
  });

  it("reads pounds written out, and a number under no currency at all as pounds unless it counts something else", () => {
    expect(line("Fee: 90 pounds\n\nConcessions: yes")).toBe("£90");
    expect(line("Fee: 60\n\nConcessions: Yes")).toBe("£60");
    expect(line("120")).toBe("£120");
    expect(line("80 to 200")).toBe("£80–£200");
    expect(line("60 per session, 50 minutes")).toBe("£60");
    expect(line("Fee:60")).toBe("£60");
    expect(line("Sessions last 50 minutes")).toBe("Sessions last 50 minutes");
    expect(line("Saturday 9am to 12 noon, 60 per session")).toBe("£60");
    expect(line("Clients 18 and over: 60, or 45 for those over 65 and 18+ students")).toBe("£45–£60");
    expect(line("Weekdays 10:30 to 18:00, fee 70")).toBe("£70");
  });

  it("gives a fee in another currency in the office's own words, rather than as pounds", () => {
    expect(line("€80 per session")).toBe("€80 per session");
    expect(line("$120")).toBe("$120");
    expect(line("80 euros")).toBe("80 euros");
  });

  it("names individual and couples fees where the office tells them apart, whichever way round it writes them", () => {
    expect(line("Individuals: £60\nCouples: £65")).toBe("Individual £60, couples £65");
    expect(line("£120 - couples/families\n£90 - individual")).toBe("Individual £90, couples £120");
    expect(line("Face-to-face sessions cost £60 for individuals and £70 for couples.")).toBe("Individual £60, couples £70");
    expect(line("£65 for Individual 1 hr session; £75 for Couples & Families; pls enquire about Group Psychotherapy.")).toBe(
      "Individual £65, couples £75",
    );
    expect(line("Individual Sessions from £80\nCouples Sessions from £90")).toBe("Individual from £80, couples from £90");
    expect(line("Individuals: £70 online, £80 in person\nCouples: £80 online, £90 in person")).toBe("Individual £70–£80, couples £80–£90");
    expect(line("Fee: Individual appointments - £90 for a 50mins, £120 for 60mins. Couples appointments - £130 for a 60mins, £195 for 90mins.")).toBe(
      "Individual £90–£120, couples £130–£195",
    );
    expect(line("An individual session costs between £55-£75.\nCouples and family sessions cost between £85-£110.")).toBe(
      "Individual £55–£75, couples £85–£110",
    );
  });

  it("takes a short line naming someone as heading the amounts below it", () => {
    expect(line("Individual sessions:\n£60 daytime\n£70 evenings\nCouples\n£90")).toBe("Individual £60–£70, couples £90");
  });

  it("gives a fee naming no one beside the couples one, where the office names no individual fee", () => {
    expect(line("£70 to £80 per session\nCouples: £100-120\nEarly mornings £90")).toBe("£70–£90, couples £100–£120");
  });

  it("leaves out what the office charges for services beside therapy", () => {
    expect(line("Individual sessions £80\nInitial assessment £120")).toBe("Individual £80");
    expect(line("£90 for individual therapy\n£110 for couple therapy\n£80 for individual supervision")).toBe("Individual £90, couples £110");
    expect(line("My fees are £60 for individual clients, £70 for couples therapy and £60 for clinical supervision.")).toBe("Individual £60, couples £70");
    expect(line("Initial consultation £40, sessions £60")).toBe("£60");
    expect(line("£55 per session\n\nI offer a free initial 20 minute consultation over the phone.")).toBe("£55");
    expect(line("£60 per session, with a free initial consultation")).toBe("£60");
  });

  it("gives only the fees for whom the search asks, or the office's general fee where it names none of them", () => {
    const cost = "£65 Individual psychotherapy\n£70 Couples Therapy\n£80 Family Psychotherapy";
    expect(line(cost, ["couple"])).toBe("Couples £70");
    expect(line(cost, ["family"])).toBe("Family £80");
    expect(line(cost, ["individual"])).toBe("Individual £65");
    expect(line(cost, ["couple", "family"])).toBe("Couples £70, family £80");
    expect(line("Individual £85\nCouple & Family £100", ["couple", "family"])).toBe("Couples and family £100");
    expect(line("£63 for 50 minutes", ["couple"])).toBe("£63");
    expect(line("£80 per session\nCouples £110", ["individual"])).toBe("£80");
    expect(line("£80 per session\nCouples £110", ["individual", "couple"])).toBe("£80, couples £110");
  });

  it("says the office gives no fee for whom the search asks, where it gives others' alone", () => {
    expect(feeLine("Individual sessions £80", ["couple"])).toEqual({ text: "No fee given for couples", given: false });
    expect(line("Individual sessions £80", ["couple", "family"])).toBe("No fee given for couples or families");
    // An unnamed fee beside named ones stands in for no one but individuals.
    expect(line("Individual therapy - 50 min - £70\nCouples therapy - 60 min - £90\nEMDR therapy - 50 min - £80", ["family"])).toBe(
      "No fee given for families",
    );
    expect(line("£45-55 per session for individuals and young people\n£60 per hour for schools, colleges or companies.", ["couple"])).toBe(
      "No fee given for couples",
    );
  });

  it("gives the fees for others where the office names neither individual nor couples fees and the search asks for no one", () => {
    expect(line("Family therapy £120\nGroups £40 per person")).toBe("Family £120, group £40");
  });

  it("says the office gives no fees, or gives its own words where they name no amount", () => {
    expect(feeLine(undefined)).toEqual({ text: "No fees given", given: false });
    expect(feeLine("  ")).toEqual({ text: "No fees given", given: false });
    expect(feeLine("To be discussed individually")).toEqual({ text: "To be discussed individually", given: true });
    expect(feeLine("Please get in touch to discuss fees, which depend on your income and circumstances.")).toEqual({
      text: "Fees on their profile",
      given: false,
    });
    expect(line("Supervision: £70 per hour")).toBe("Fees on their profile");
  });
});

describe("feeKinds", () => {
  it("asks for the fees of whom the Works With ticks name, in a set order, and none for the rest", () => {
    expect(feeKinds(["Couples", "Individuals"])).toEqual(["individual", "couple"]);
    expect(feeKinds(["Children and young people", "Families", "Groups"])).toEqual(["family", "group", "child"]);
    expect(feeKinds(["Companies", "Private healthcare referrals"])).toEqual([]);
  });
});
