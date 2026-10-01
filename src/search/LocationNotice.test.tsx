// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocationNotice, locationFellBack } from "./LocationNotice";

describe("locationFellBack", () => {
  it.each([
    ["Brightn", "United Kingdom", true],
    ["Brighton", "Brighton", false],
    ["", undefined, false],
    ["UK", "United Kingdom", false],
    [" united kingdom ", "United Kingdom", false],
  ])("typed %j, searched %j: %s", (typed, searched, expected) => {
    expect(locationFellBack(typed, searched)).toBe(expected);
  });
});

describe("LocationNotice", () => {
  it("warns when UKCP didn't recognise the place, marked as a notice", () => {
    render(<LocationNotice typed=" Brightn " searched="United Kingdom" />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(`UKCP didn't recognise "Brightn", so these results are from across the UK. Try a town or a postcode.`);
    expect(alert.querySelector("svg")?.classList.contains("lucide-info")).toBe(true);
  });

  it("says nothing when UKCP knew the place, or there was none", () => {
    expect(render(<LocationNotice typed="brighton" searched="Brighton" />).container.textContent).toBe("");
    expect(render(<LocationNotice typed="" />).container.textContent).toBe("");
  });
});
