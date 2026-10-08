// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocationNotice } from "./LocationNotice";

describe("LocationNotice", () => {
  it("warns when UKCP didn't recognise the place, marked as a notice that interrupts no one", () => {
    const { container } = render(<LocationNotice typed=" Brightn " searched="United Kingdom" />);
    const notice = container.querySelector<HTMLElement>('[data-slot="alert"]')!;
    expect(notice.textContent).toBe(`UKCP didn't recognise "Brightn", so these results are from across the UK. Try a postcode or a town.`);
    expect(notice.querySelector("svg")?.classList.contains("lucide-info")).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says nothing when UKCP knew the place, or there was none", () => {
    expect(render(<LocationNotice typed="brighton" searched="Brighton" />).container.textContent).toBe("");
    expect(render(<LocationNotice typed="" />).container.textContent).toBe("");
  });
});
