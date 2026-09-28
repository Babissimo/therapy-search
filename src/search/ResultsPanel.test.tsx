// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResultsPanel } from "./ResultsPanel";

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <TooltipProvider>
      <ResultsPanel open={open} onOpenChange={setOpen} title="257 results" footer={<button type="button">Load more</button>}>
        <p>The list</p>
      </ResultsPanel>
    </TooltipProvider>
  );
}

describe("ResultsPanel", () => {
  it("collapses to a button that brings it back", () => {
    render(<Harness />);
    expect(screen.getByRole("heading", { name: "257 results" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
    const show = screen.getByRole("button", { name: "Show results" });
    expect(show.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(show);
    expect(screen.getByRole("region", { name: "Results" }).textContent).toContain("The list");
    expect(screen.getByRole("button", { name: "Hide results" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps its footer outside the scrolling list", () => {
    render(<Harness />);
    const list = screen.getByText("The list").parentElement!;
    expect(list.className).toContain("overflow-y-auto");
    expect(list.contains(screen.getByRole("button", { name: "Load more" }))).toBe(false);
  });
});
