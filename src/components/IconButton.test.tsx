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
  it("shows its label after its icon on touch screens and wherever it is stacked, when asked, the words it shows starting its name", () => {
    renderButtons();
    const filters = screen.getByRole("button", { name: "Filters, 2 ticked" });
    const shown = within(filters).getByText("Filters");
    expect(filters.firstElementChild).toBe(shown);
    expect(shown.className).toContain("stacked:not-sr-only");
    expect(shown.className).toContain("stacked:order-last");
    expect(within(screen.getByRole("button", { name: "Search" })).getByText("Search").className).toBe("sr-only");
  });

  it("shows only the words asked for where it shows its label, which start its name, keeping the rest of its label in its name", () => {
    render(
      <TooltipProvider>
        <IconButton label="Add Jo Cole to your shortlist" touchLabel="Add">
          <svg aria-hidden />
        </IconButton>
      </TooltipProvider>,
    );
    const button = screen.getByRole("button", { name: "Add Jo Cole to your shortlist" });
    const [shown, rest] = button.children;
    expect([shown?.textContent, shown?.className]).toEqual(["Add", expect.stringContaining("stacked:not-sr-only")]);
    expect([rest?.textContent, rest?.className]).toEqual(["Jo Cole to your shortlist", "sr-only"]);
    act(() => button.focus());
    expect(screen.getByRole("tooltip").closest("[data-slot=tooltip-content]")?.className).toContain("pointer-coarse:hidden");
  });

  it("leaves its tooltip to pointers that hover when it shows its label on touch screens", () => {
    renderButtons();
    act(() => screen.getByRole("button", { name: /^Filters/ }).focus());
    expect(screen.getByRole("tooltip").closest("[data-slot=tooltip-content]")?.className).toContain("pointer-coarse:hidden");
  });
});
