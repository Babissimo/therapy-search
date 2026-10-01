import { describe, expect, it } from "vitest";
import { feeText } from "./fee";

describe("feeText", () => {
  it("gives an office's one amount as it stands, in whole pounds where it has no pence", () => {
    expect(feeText("£70")).toBe("£70");
    expect(feeText("£63 for 50 minutes.")).toBe("£63");
    expect(feeText("My fees are £60.")).toBe("£60");
    expect(feeText("£85.00")).toBe("£85");
    expect(feeText("£62.50 per session")).toBe("£62.50");
    expect(feeText("£1,200 for a block of twelve")).toBe("£1,200");
  });

  it("gives the lowest of several amounts, a range's included, as where fees start", () => {
    expect(feeText("£75\n£85 for slots after 6pm")).toBe("From £75");
    expect(feeText("Full rate: £80 (50 min)\nMiddle rate: £70 (50 mins)\nLower rate: £60 (50 mins)")).toBe("From £60");
    expect(feeText("My fees are £60 -70")).toBe("From £60");
    expect(feeText("£60–£100 sliding scale")).toBe("From £60");
    expect(feeText("Individual sessions £80 Initial assessment £120")).toBe("From £80");
  });

  it("reads a smaller number or a length after a dash as something other than a range's end", () => {
    expect(feeText("£70 - 50 minute sessions")).toBe("£70");
    expect(feeText("£60 - 90 minutes")).toBe("£60");
    expect(feeText("£90 - 2 hours")).toBe("£90");
    expect(feeText("£60 - 90 mins, £45 - 50 mins")).toBe("From £45");
  });

  it("says where fees start when the office does, and not for one amount repeated", () => {
    expect(feeText("From £70 per 50 minute session")).toBe("From £70");
    expect(feeText("£70 online, or £70 in person")).toBe("£70");
  });

  it("gives nothing where the office names no amount in pounds", () => {
    expect(feeText(undefined)).toBeUndefined();
    expect(feeText("Variable")).toBeUndefined();
    expect(feeText("Fee: 60\nConcessions: Yes")).toBeUndefined();
    expect(feeText("£55 per session\nI offer a free initial 20 minute consultation")).toBe("£55");
  });
});
