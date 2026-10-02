import { describe, expect, it } from "vitest";
import { onlineParams } from "@shared/online";
import { emptyParams, type SearchParams } from "@shared/query";
import { nearMeParams, rememberPlace } from "./online";
import { withFlag, withMulti, withText } from "./state";

const sessions = (...values: string[]): SearchParams => values.reduce((p, v) => withMulti(p, "TypesOfSession", v, true), emptyParams());
const inLeeds = withFlag(withText(withMulti(sessions("Online Therapy", "Home Visits"), "Languages", "Greek", true), "Location", "Leeds"), "LocationSearchOutsideUK", true);
const accessible = (params: SearchParams) => withFlag(params, "OnlyWheelchairAccessible", true);

describe("nearMeParams", () => {
  it("searches the place last left for online again, with its wheelchair tick and the filters chosen since", () => {
    rememberPlace(accessible(inLeeds));
    const near = nearMeParams(withMulti(onlineParams(inLeeds), "Languages", "French", true));
    expect(near.text.Location).toBe("Leeds");
    expect(near.flags.LocationSearchOutsideUK).toBe(true);
    expect(near.flags.OnlyWheelchairAccessible).toBe(true);
    expect(near.multi.Languages).toEqual(["Greek", "French"]);
    expect(near.multi.TypesOfSession).toEqual(["Online Therapy"]);
  });

  it("forgets the place once online is reached from a search without one", () => {
    rememberPlace(inLeeds);
    rememberPlace(emptyParams());
    expect(nearMeParams(emptyParams()).text.Location).toBe("");
  });
});
