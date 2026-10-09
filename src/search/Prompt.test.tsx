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

  it("offers the questions where asked to, and leaves no line for them otherwise", () => {
    const { unmount } = render(
      <Prompt ask="Start with what matters to you." questions>
        Tick anything that matters to you.
      </Prompt>,
      { wrapper: MemoryRouter },
    );
    expect(screen.getByRole("link", { name: "Answer a few questions instead" }).getAttribute("href")).toBe("/questions");
    unmount();
    render(<Prompt ask="Before we search near Leeds">A tick or two below.</Prompt>, { wrapper: MemoryRouter });
    expect(screen.queryByText("Answer a few questions instead")).toBeNull();
  });
});
