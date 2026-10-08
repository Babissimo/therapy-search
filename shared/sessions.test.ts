import { describe, expect, it } from "vitest";
import { emptyParams, type SearchParams } from "./query";
import { asksUnsaid, saysNothing, withoutSessions } from "./sessions";

function near(Location: string, ...TypesOfSession: string[]): SearchParams {
  const empty = emptyParams();
  return { ...empty, text: { ...empty.text, Location }, multi: { ...empty.multi, TypesOfSession, Languages: ["Greek"] } };
}

describe("asksUnsaid", () => {
  it("lists those who don't say how they meet beside any face-to-face tick near a place", () => {
    expect(asksUnsaid(near("Leeds", "Face to Face - Long Term"))).toBe(true);
    expect(asksUnsaid(near("Leeds", "Face to Face - Short Term", "Online Therapy"))).toBe(true);
  });

  it("leaves them to the search itself without a face-to-face tick or a place", () => {
    expect(asksUnsaid(near("Leeds"))).toBe(false);
    expect(asksUnsaid(near("Leeds", "Home Visits"))).toBe(false);
    expect(asksUnsaid(near("Leeds", "Online Therapy", "Telephone Therapy"))).toBe(false);
    expect(asksUnsaid(near("", "Face to Face - Long Term"))).toBe(false);
  });
});

describe("saysNothing", () => {
  it("is true of a card with no session line", () => {
    expect([saysNothing({ hasSessions: false }), saysNothing({ hasSessions: true })]).toEqual([true, false]);
  });
});

describe("withoutSessions", () => {
  it("is the same search with no session types ticked", () => {
    expect(withoutSessions(near("Leeds", "Face to Face - Long Term", "Online Therapy"))).toEqual(near("Leeds"));
  });
});
