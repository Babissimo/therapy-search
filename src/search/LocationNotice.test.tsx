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
  it("warns when UKCP didn't recognise the place, marked as a notice that interrupts no one", () => {
    const { container } = render(<LocationNotice typed=" Brightn " searched="United Kingdom" />);
    const notice = container.querySelector<HTMLElement>('[data-slot="alert"]')!;
    expect(notice.textContent).toBe(`UKCP didn't recognise "Brightn", so these results are from across the UK. Try a town or a postcode.`);
    expect(notice.querySelector("svg")?.classList.contains("lucide-info")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("names the place UKCP searched otherwise", () => {
    render(<LocationNotice typed="brighton" searched="Brighton" />);
    expect(screen.getByText("Brighton").tagName).toBe("STRONG");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says nothing for a search without a location", () => {
    const { container } = render(<LocationNotice typed="" />);
    expect(container.textContent).toBe("");
  });
});
