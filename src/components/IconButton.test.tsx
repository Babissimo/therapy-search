// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IconButton } from "./IconButton";

function renderButtons() {
  render(
    <TooltipProvider>
      <IconButton label="Filters" touchLabel>
        <svg aria-hidden />
        <span className="sr-only">, 2 ticked</span>
      </IconButton>
      <IconButton label="Search">
        <svg aria-hidden />
      </IconButton>
    </TooltipProvider>,
  );
}

describe("IconButton", () => {
  it("shows its label after its icon on touch screens when asked, the words it shows starting its name", () => {
    renderButtons();
    const filters = screen.getByRole("button", { name: "Filters, 2 ticked" });
    const shown = within(filters).getByText("Filters");
    expect(filters.firstElementChild).toBe(shown);
    expect(shown.className).toContain("pointer-coarse:not-sr-only");
    expect(shown.className).toContain("pointer-coarse:order-last");
    expect(within(screen.getByRole("button", { name: "Search" })).getByText("Search").className).toBe("sr-only");
  });

  it("leaves its tooltip to pointers that hover when it shows its label on touch screens", () => {
    renderButtons();
    act(() => screen.getByRole("button", { name: /^Filters/ }).focus());
    expect(screen.getByRole("tooltip").closest("[data-slot=tooltip-content]")?.className).toContain("pointer-coarse:hidden");
  });
});
