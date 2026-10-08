import { describe, expect, it } from "vitest";
import { placeSent, type Handoff } from "./handoff";

describe("placeSent", () => {
  it("reads the place a hand-off sends, and nothing from any other state", () => {
    expect(placeSent({ place: "Leeds" } satisfies Handoff)).toBe("Leeds");
    for (const state of [undefined, null, "Leeds", { place: 3 }, { from: "Leeds" }]) expect(placeSent(state)).toBeUndefined();
  });
});
