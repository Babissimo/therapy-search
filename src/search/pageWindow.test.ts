import { describe, expect, it } from "vitest";
import { pageWindow } from "./pageWindow";

describe("pageWindow", () => {
  it.each([
    [1, 1, [1]],
    [2, 3, [1, 2, 3]],
    [1, 706, [1, 2, "gap", 706]],
    [5, 10, [1, "gap", 4, 5, 6, "gap", 10]],
    [10, 10, [1, "gap", 9, 10]],
  ])("page %i of %i", (page, total, expected) => {
    expect(pageWindow(page, total)).toEqual(expected);
  });
});
