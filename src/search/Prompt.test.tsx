// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { Prompt } from "./Prompt";

describe("Prompt", () => {
  it("says beneath the ask that UKCP does not run the site, with the way to About", () => {
    render(<Prompt ask="Start with what matters to you.">Tick anything that matters to you.</Prompt>, { wrapper: MemoryRouter });
    const about = screen.getByRole("link", { name: "More about this site" });
    expect(about.getAttribute("href")).toBe("/about");
    expect(about.parentElement?.textContent).toBe("This site is unofficial: UKCP does not run it. More about this site");
  });
});
